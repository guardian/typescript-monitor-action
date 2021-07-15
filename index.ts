import { getInput, setFailed } from '@actions/core';
import { context, getOctokit } from '@actions/github';
import run from './src/';

const tokenInput = 'repo-token';

(async () => {
	try {
		const token = getInput(tokenInput);
		const octokit = getOctokit(token);
		await run(octokit, context, token);
	} catch (e) {
		setFailed(e.message);
	}
})();
