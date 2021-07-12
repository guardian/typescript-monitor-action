const { getInput, setFailed } = require('@actions/core');
const { context, getOctokit } = require('@actions/github');
const run = require('./src/index');

const tokenInput = 'repo-token';

(async () => {
	try {
		const token = getInput(tokenInput);
		const octokit = getOctokit(token);
		await run(octokit, context);
	} catch (e) {
		setFailed(e.message);
	}
})();
