import fs from "fs";
import { exec } from '@actions/exec';
import { Context } from '@actions/github/lib/context';
import { GitHub } from "@actions/github/lib/utils";

export function stringToBool(booleanString: string) {
  if (booleanString === 'true') {
    return true;
  }
  return false;
}

export async function safeAccess(filePath: string) {
	try {
		await fs.promises.access(filePath, fs.constants.F_OK);
		return true;
	} catch (e) {}
	return false;
}

export async function execWithOutput(command: string, args: string[] = []) {
	let output = '';
	
	const options = {
		silent: true,
		listeners: {
			stdout: (data: Buffer) => {
				output += data.toString();
			},
			stderr: (data: Buffer) => {
				output += data.toString();
			}
		},
	};
	
	try {
		await exec(command, args, options);
	} catch (error) {}
	
	return output;
}

function getChangeEmoji(errorChange: number) {
	if (errorChange > 10) {
		return '😱'
	} else if (errorChange > 0) {
		return '😰'
	} else if (errorChange < -10) {
		return '🥳'
	}	else if (errorChange < 0) {
		return '😎'
	}
	return '😶'
}

export function errorDiffLine(errorChange: number, checkType: string): string {
	const changeWord = errorChange > 0 ? 'increased' : 'decreased';
	if (errorChange === 0) {
		return `${checkType} errors did not change ${getChangeEmoji(errorChange)}`;
	}
	return `${checkType} errors ${changeWord} by ${Math.abs(errorChange)} ${getChangeEmoji(errorChange)}\n`;
}

type CheckResultType = {
	conclusion: string,
	output: {
		title: string,
		summary: string
	}
}

export async function createCheck(octokit: InstanceType<typeof GitHub>, context: Context) {
	const check = await octokit.rest.checks.create({
		...context.repo,
		name: 'Typescript Monitor',
		head_sha: context?.payload.pull_request?.head.sha,
		status: 'in_progress',
	});

	return async (details: CheckResultType) => {
		await octokit.rest.checks.update({
			...context.repo,
			check_run_id: check.data.id,
			completed_at: new Date().toISOString(),
			status: 'completed',
			...details
		});
	};
}

export async function getAssociatedPR(octokit: InstanceType<typeof GitHub>, context: Context) {
	try {
		const { data: associatedPRs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit(
			{
				...context.repo,
				commit_sha: context.payload.after,
			
			}
		)
		return associatedPRs.find(pr => pr.state === 'open');
	} catch (error) {
		console.log('Error getting PR associated with this commit', error)
	}
}
