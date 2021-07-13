import { setFailed } from '@actions/core';
import { context } from '@actions/github';
import run from './src/';

// const tokenInput = 'repo-token';

(async () => {
	try {
		// const token = getInput(tokenInput);
		// const octokit = getOctokit(token);
		await run(context);
	} catch (e) {
		setFailed(e.message);
	}
})();
