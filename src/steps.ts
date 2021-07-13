import { startGroup, endGroup } from '@actions/core';
import { exec } from '@actions/exec';

type ComparisonBranchType = 'current' | 'base';

export async function installStep(branch: ComparisonBranchType, installScript: string) {
	startGroup(`[${branch}] Install Dependencies`);
	console.log(`Installing using ${installScript}`)
	await exec(installScript);
	endGroup();
}

export async function checkoutBaseBranch(baseRef?: string, baseSha?: string) {
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
}