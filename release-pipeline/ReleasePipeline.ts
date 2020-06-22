/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHub, GitHubIssue } from '../api/api'
import { loadLatestRelease, Release } from '../common/utils'
import { trackEvent } from '../common/telemetry'

export class ReleasePipeline {
	constructor(
		private github: GitHub,
		private notYetReleasedLabel: string,
		private insidersReleasedLabel: string,
	) {}

	async run() {
		const latestRelease = await loadLatestRelease('insider')
		if (!latestRelease) throw Error('Error loading latest release')

		const query = `is:closed label:${this.notYetReleasedLabel}`

		for await (const page of this.github.query({ q: query })) {
			for (const issue of page) {
				const issueData = await issue.getIssue()
				if (issueData.labels.includes(this.notYetReleasedLabel) && issueData.open === false) {
					await this.update(issue, latestRelease)
					await new Promise((resolve) => setTimeout(resolve, 1000))
				} else {
					console.log(
						'Query returned an invalid issue:' +
							JSON.stringify({ ...issueData, body: 'stripped' }),
					)
				}
			}
		}
	}

	private async update(issue: GitHubIssue, latestRelease: Release) {
		const closingHash = (await issue.getClosingInfo())?.hash

		if (!closingHash) {
			await issue.removeLabel(this.notYetReleasedLabel)
			await issue.postComment(
				`<!-- UNABLE_TO_LOCATE_COMMIT_MESSAGE -->
Issue marked as unreleased but unable to locate closing commit in issue timeline. You can manually reference a commit by commenting \`\\closedWith someCommitSha\`, then add back the \`unreleased\` label.`,
			)
			return
		}

		let errorMessage = ''
		const releaseContainsCommit = await issue
			.releaseContainsCommit(latestRelease.version, closingHash)
			.catch(async (e) => {
				errorMessage = `\n\`\`\`${e.message}\`\`\``
				return 'unknown' as const
			})

		if (releaseContainsCommit === 'yes') {
			await trackEvent(issue, 'insiders-released:released')
			await issue.removeLabel(this.notYetReleasedLabel)
			await issue.addLabel(this.insidersReleasedLabel)
		} else if (releaseContainsCommit === 'no') {
			await issue.removeLabel(this.insidersReleasedLabel)
			await issue.addLabel(this.notYetReleasedLabel)
		} else if ((await issue.getIssue()).labels.includes(this.notYetReleasedLabel)) {
			await issue.removeLabel(this.notYetReleasedLabel)
			await issue.postComment(
				`<!-- UNABLE_TO_LOCATE_COMMIT_MESSAGE -->
Issue marked as unreleased but unable to locate closing commit in repo history. You can manually reference a commit by commenting \`\\closedWith someCommitSha\`, then add back the \`unreleased\` label.` +
					errorMessage,
			)
		}
	}
}

export const enrollIssue = async (issue: GitHubIssue, notYetReleasedLabel: string) => {
	const closingHash = (await issue.getClosingInfo())?.hash
	if (closingHash) {
		await issue.addLabel(notYetReleasedLabel)
		await trackEvent(issue, 'insiders-released:unreleased')
	} else {
		await trackEvent(issue, 'insiders-released:skipped')
	}
}

export const unenrollIssue = async (
	issue: GitHubIssue,
	notYetReleasedLabel: string,
	insidersReleasedLabel: string,
) => {
	await issue.removeLabel(insidersReleasedLabel)
	await issue.removeLabel(notYetReleasedLabel)
}
