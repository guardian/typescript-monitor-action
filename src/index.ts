import path from 'path';
import { getInput, setFailed, startGroup, endGroup, debug } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import { installStep, checkoutBaseBranch } from "./steps";
import { execWithOutput, safeAccess, stringToBool } from "./utils";

const tsInput = 'check-typescript';
const lintInput = 'check-linting';
const tsScriptInput = 'ts-script';
const lintScriptInput = 'lint-script';

type BranchErrorCountType = {
	typescript: number;
	eslint: number;
}

async function getTypescriptErrorCount(): Promise<number> {
	const script = getInput(tsScriptInput);
	const output = await execWithOutput(script);
		
	if (output) {
		const lines = output.split(/(\r?\n)/g);
		const errorAmount = lines.reduce((errorCount, line) => {
			const lineIsError =
				/error TS\d+:/gm.exec(
					line,
				);
	
			if (lineIsError) {
				return errorCount + 1;
			}
	
			return errorCount;
		}, 0);
		
		console.log(`Found ${errorAmount} TS errors`);
		return errorAmount;
	} else {
		throw new Error('Could not check for Typescript errors');
	}
}

async function getLintErrorCount(): Promise<number> {
	const script = getInput(lintScriptInput);
	const output = await execWithOutput(script);
	if (output) {
		const captures = /problems \((?<errorCount>\d+) errors/gm.exec(output);
		console.log(`Found ${captures?.groups?.errorCount} ESLint errors`);
		return Number.parseInt(captures?.groups?.errorCount || '0');
	} else {
		throw new Error('Could not check for ESLint errors');
	}
}

async function getErrorCounts(doTs: boolean, doLint: boolean): Promise<BranchErrorCountType> {
	return {
		typescript: doTs ? await getTypescriptErrorCount() : 0,
		eslint: doLint ? await getLintErrorCount() : 0,
	}
}

function getBaseRef(context: Context): { baseSha?: string, baseRef?: string } {
	if (context.eventName == "push") {
		return {
			baseSha: context.payload.before,
			baseRef: context.payload.ref,
		}
	} else if (context.eventName == "pull_request" || context.eventName == 'pull_request_target') {
		const pr = context.payload.pull_request;
		return {
			baseSha: pr?.base.sha,
			baseRef: pr?.base.ref,
		}
	} else {
		throw new Error(
			`Unsupported eventName in github.context: ${context.eventName}. Only "pull_request", "pull_request_target" and "push" triggered workflows are currently supported.`
		);
	}
}

async function getInstallScript(): Promise<string> {
	const cwd = process.cwd();
	const hasYarnLock = await safeAccess(path.resolve(cwd, 'yarn.lock'));
	const hasPackageLock = await safeAccess(path.resolve(cwd, 'package-lock.json'));
	
	if (hasYarnLock) {
		return 'yarn --frozen-lockfile';
	} else if (hasPackageLock) {
		return 'npm ci';
	}

	throw new Error('Could not detect the project\'s package manager');
}

export default async function run(context: Context) {
	const errorCounts: Record<string, BranchErrorCountType> = {
		base: {
			typescript: 0,
			eslint: 0,
		},
		branch: {
			typescript: 0,
			eslint: 0,
		},
	}
	const doTsCheck = stringToBool(getInput(tsInput));
	const doLintCheck = stringToBool(getInput(lintInput));
	
	const installScript = await getInstallScript();
	
	if (getInput('cwd')) {
		process.chdir(getInput('cwd'));
	}
	
	try {
		debug('pr' + JSON.stringify(context.payload, null, 2));
	} catch (e) { }

	const { baseSha, baseRef } = getBaseRef(context);
	
	await installStep('current', installScript);

	startGroup(`[current] Checking for errors`);
	console.log('Getting error counts for the current branch');
	errorCounts.branch = await getErrorCounts(doTsCheck, doLintCheck);
	endGroup();
	
	checkoutBaseBranch(baseRef, baseSha);
	
	await installStep('base', installScript);
	
	startGroup(`[base] Checking for errors`);
	console.log('Getting error counts for the base branch');
	errorCounts.base = await getErrorCounts(doTsCheck, doLintCheck);
	endGroup();
	
	if (doTsCheck) {
		const tsErrorCountChange = errorCounts.branch.typescript - errorCounts.base.typescript;
		if (tsErrorCountChange > 0) {
			setFailed('More TS errors were introduced');
		}
		console.log(`Change in TS errors: ${tsErrorCountChange}`);
	}
	
	if (doLintCheck) {
		const lintErrorCountChange = errorCounts.branch.eslint - errorCounts.base.eslint;
		if (lintErrorCountChange > 0) {
			setFailed('More lint errors were introduced');
		}
		console.log(`Change in lint errors: ${lintErrorCountChange}`);
	}
}
