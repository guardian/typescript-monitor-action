import path from 'path';
import { getInput, setFailed, startGroup, endGroup, debug } from '@actions/core';
import { Context } from '@actions/github/lib/context';
import { GitHub } from "@actions/github/lib/utils";
import { installStep, checkoutBaseBranch, addOrUpdateComment } from "./steps";
import { createCheck, errorDiffLine, execWithOutput, getAssociatedPR, safeAccess, stringToBool } from "./utils";

const tsInput = 'check-typescript';
const lintInput = 'check-linting';
const tsScriptInput = 'ts-script';
const lintScriptInput = 'lint-script';

type ErrorCheckType = 'typescript' | 'eslint';

type BranchErrorCountType = {
	[key in ErrorCheckType]: number;
}

type ErrorCountCollectionType = {
	base: BranchErrorCountType;
	branch: BranchErrorCountType;
};

const formattedErrorCheckNames: { [key in ErrorCheckType]: string } = {
	typescript: 'TypeScript',
	eslint: 'ESLint'
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

function handleErrorCountChange(
	errorCounts: ErrorCountCollectionType,
	checkType: ErrorCheckType,
	failureSideEffect?: () => void) {
	const errorCountChange = errorCounts.branch[checkType] - errorCounts.base[checkType];
	if (errorCountChange > 0 && failureSideEffect) {
		failureSideEffect();
	}
	return errorDiffLine(errorCountChange, formattedErrorCheckNames[checkType]);
}

async function getBaseRef(octokit: InstanceType<typeof GitHub>, context: Context): Promise<{ baseSha?: string, baseRef?: string }> {
	if (context.eventName == "push") {
		const prToCheck = await getAssociatedPR(octokit, context);
		return {
			baseSha: prToCheck?.base.sha,
			baseRef: prToCheck?.base.ref,
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

export default async function run(octokit: InstanceType<typeof GitHub>, context: Context, token: string) {
	const errorCounts: ErrorCountCollectionType = {
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

	const { baseSha, baseRef } = await getBaseRef(octokit, context);
	
	if (!baseSha && !baseRef) {
		console.log('Could not find base branch, cancelling workflow');
		return;
	}
	
	await installStep('current', installScript);

	startGroup(`[current] Checking for errors`);
	console.log('Getting error counts for the current branch');
	errorCounts.branch = await getErrorCounts(doTsCheck, doLintCheck);
	endGroup();
	
	await checkoutBaseBranch(baseRef, baseSha);
	
	await installStep('base', installScript);
	
	startGroup(`[base] Checking for errors`);
	console.log('Getting error counts for the base branch');
	errorCounts.base = await getErrorCounts(doTsCheck, doLintCheck);
	endGroup();
	
	let failed = false;
	
	const tsSummary = doTsCheck ? handleErrorCountChange(
		errorCounts,
		'typescript',
		() => {
			setFailed(`More ${formattedErrorCheckNames.typescript} errors were introduced`);
			failed = true;
		},
	) : '';
	
	const lintSummary = doLintCheck ? handleErrorCountChange(
				errorCounts,
				'eslint',
				() => {
					setFailed(`More ${formattedErrorCheckNames.eslint} errors were introduced`);
					failed = true;
				},
			) : ''
	
	const actionLink = '\n\n<a href="https://github.com/guardian/typescript-monitor-action"><sub>typescript-monitor-action</sub></a>'
	
	const summary = [tsSummary, lintSummary, actionLink].join('');
	
	if (context.eventName !== 'pull_request' && context.eventName !== 'pull_request_target') {
		console.log('No PR associated with this action run. Not posting a check');
	}	else if (token) {
		const finishCheck = await createCheck(octokit, context);
		const details = {
			conclusion: failed ? 'failure': 'success',
			output: {
				title: 'Typescript Monitor',
				summary,
			}
		};
		await finishCheck(details);
	}
	addOrUpdateComment(octokit, context, summary);
}
