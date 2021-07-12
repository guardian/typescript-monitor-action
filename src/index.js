const fs = require('fs');
const path = require('path');
const { getInput, setFailed, startGroup, endGroup, debug } = require('@actions/core');
const { exec } = require('@actions/exec');

const tsInput = 'check-typescript';
const lintInput = 'check-linting';
const tsScriptInput = 'ts-script';
const lintScriptInput = 'lint-script';

async function execWithOutput(command, args = []) {
	let output = '';
	
	const options = {
		silent: true,
		listeners: {
			stdout: (data) => {
				output += data.toString();
			},
			stderr: (data) => {
				output += data.toString();
			}
		},
	};
	
	try {
		await exec(command, args, options);
	} catch (error) {}
	
	return output;
}

async function getTypescriptErrorCount() {
	const script = getInput(tsScriptInput);
	const output = await execWithOutput(script);
		
	if (output) {
		const lines = output.split(/(\r?\n)/g);
	
		return lines.reduce((errorCount, line) => {
			const lineIsError =
				/error TS\d+:/gm.exec(
					line,
				);
	
			if (lineIsError) {
				return errorCount + 1;
			}
	
			return errorCount;
		}, 0);
	} else {
		throw new Error('Could not check for Typescript errors');
	}
}

async function getLintErrorCount() {
	const script = getInput(lintScriptInput);
	const output = await execWithOutput(script);
	if (output) {
		const captures = /problems \((?<errorCount>\d+) errors/gm.exec(output);
		return captures.groups.errorCount;
	} else {
		throw new Error('Could not check for ESLint errors');
	}
}

async function getErrorCounts(doTs, doLint) {
	return {
		typescript: doTs ? await getTypescriptErrorCount() : null,
		eslint: doLint ? await getLintErrorCount() : null,
	}
}

async function installStep(branch, installScript) {
	startGroup(`[${branch}] Install Dependencies`);
	console.log(`Installing using yarn`)
	await exec(installScript);
	endGroup();
}

async function safeAccess(filePath) {
	try {
		await fs.promises.access(filePath, fs.constants.F_OK);
		return true;
	} catch (e) {}
	return false;
}

async function getInstallScript() {
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

async function run(octokit, context) {
	const errorCounts = {
		base: {
			typescript: null,
			eslint: null,
		},
		branch: {
			typescript: null,
			eslint: null,
		},
	}
	const doTsCheck = getInput(tsInput);
	const doLintCheck = getInput(lintInput);
	
	const installScript = await getInstallScript();
	
	if (getInput('cwd')) {
		process.chdir(getInput('cwd'));
	}
	
	try {
		debug('pr' + JSON.stringify(context.payload, null, 2));
	} catch (e) { }

	let baseSha, baseRef;
	if (context.eventName == "push") {
		baseSha = context.payload.before;
		baseRef = context.payload.ref;

	} else if (context.eventName == "pull_request" || context.eventName == 'pull_request_target') {
		const pr = context.payload.pull_request;
		baseSha = pr.base.sha;
		baseRef = pr.base.ref;

	} else {
		throw new Error(
			`Unsupported eventName in github.context: ${context.eventName}. Only "pull_request", "pull_request_target" and "push" triggered workflows are currently supported.`
		);
	}
	
	await installStep('current', installScript);

	startGroup(`[current] Checking for errors`);
	console.log('Getting error counts for the branch');
	errorCounts.branch = await getErrorCounts(doTsCheck, doLintCheck);
	endGroup();
	
	startGroup(`[base] Checkout target branch`);
	try {
		if (!baseRef) throw Error('missing context.payload.pull_request.base.ref');
		await exec(`git fetch -n origin ${baseRef}`);
		console.log('successfully fetched base.ref');
	} catch (e) {
		console.log('fetching base.ref failed', e.message);
		try {
			await exec(`git fetch -n origin ${baseSha}`);
			console.log('successfully fetched base.sha');
		} catch (e) {
			console.log('fetching base.sha failed', e.message);
			try {
				await exec(`git fetch -n`);
			} catch (e) {
				console.log('fetch failed', e.message);
			}
		}
	}
	endGroup();
	
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
		const lintErrorCountChange = errorCounts.branch.typescript - errorCounts.base.typescript;
		if (lintErrorCountChange > 0) {
			setFailed('More lint errors were introduced');
		}
		console.log(`Change in lint errors: ${lintErrorCountChange}`);
	}
}

module.exports = run;