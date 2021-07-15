import { startGroup, endGroup } from '@actions/core';
import { exec } from '@actions/exec';
import { Context } from '@actions/github/lib/context';
import { GitHub } from "@actions/github/lib/utils";

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

type CommentInfoType = {
	owner: string;
	repo: string;
	issue_number: number;
}

type CommentType = CommentInfoType & {
	body: string;
}

async function getExistingComment(octokit: InstanceType<typeof GitHub>, commentInfo: CommentInfoType): Promise<number | null> {
	try {
		const comments = (await octokit.rest.issues.listComments(commentInfo)).data;
		for (let i = comments.length; i--;) {
			const c = comments[i];
			if (c.body && c.user?.type === 'Bot' && /<sub>[\s\n]*typesript-monitor-action/.test(c.body)) {
				return c.id
			}
		}
	}	catch (e) {
		console.log('Error checking for previous comments: ' + e.message);
	}
	return null;
}

async function createNewComment(octokit: InstanceType<typeof GitHub>, context: Context, comment: CommentType) {
	console.log('Creating new comment');
	try {
		await octokit.rest.issues.createComment(comment);
	} catch (e) {
		console.log(`Error creating comment: ${e.message}`);
		console.log(`Submitting a PR review comment instead...`);
		try {
			const issue = context.issue;
			await octokit.rest.pulls.createReview({
				owner: issue.owner,
				repo: issue.repo,
				pull_number: issue.number,
				event: 'COMMENT',
				body: comment.body
			});
		} catch (e) {
			console.log('Error creating PR review.');
		}
	}
}

async function updateExistingComment(octokit: InstanceType<typeof GitHub>, context: Context, commentId: number, comment: CommentType) {
	console.log(`Updating previous comment #${commentId}`)
	try {
		await octokit.rest.issues.updateComment({
			...context.repo,
			comment_id: commentId,
			body: comment.body
		});
	} catch (e) {
		console.log('Error editing previous comment: ' + e.message);
		createNewComment(octokit, context, comment)
	}	
}

export async function addOrUpdateComment(octokit: InstanceType<typeof GitHub>, context: Context, commentBody: string) {
	const commentInfo = {
		...context.repo,
		issue_number: context.issue.number,
	}
	
	const comment = {
		...commentInfo,
		body: commentBody,
	}
	
	startGroup(`Updating monitor PR comment`);
	const commentId = await getExistingComment(octokit, commentInfo);
	
	if (commentId) {
		updateExistingComment(octokit, context, commentId, comment);
	} else {
		createNewComment(octokit, context, comment);
	}
	endGroup();
}