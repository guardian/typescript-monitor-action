const { getInput, setFailed } = require('@actions/core');
const { context, getOctokit } = require('@actions/github');
const run = require('./src/index');

(async () => {
	try {
		const token = getInput(tokenInput);
		const octokit = getOctokit(token);
		await run(octokit, context, token);
	} catch (e) {
		setFailed(e.message);
	}
})();
