const cache = require('../cache');
const { Comment } = require('../messages/comment');
const { sendMessageToChannel } = require('../slack/channel-manager');

module.exports = async (context, subscription, slackWorkspace) => {
  const { repository } = context.payload;

  const issue = context.payload.issue || context.payload.pull_request;

  // Fetch updated comment to get body_html
  const comment = (await context.github.request({
    method: 'GET',
    url: context.payload.comment.url,
    headers: { accept: 'application/vnd.github.html+json' },
  })).data;

  let commit = null;
  if (context.event === 'commit_comment') {
    commit = (await context.github.gitdata.getCommit({
      owner: repository.owner.login,
      repo: repository.name,
      commit_sha: comment.commit_id,
    })).data;
  }

  const attachments = [
    new Comment({
      comment,
      commit,
      issue,
      repository,
    }).getRenderedMessage(),
  ];

  const cacheKey = subscription.cacheKey(`comment#${context.payload.comment.node_id}`);
  const storedMetaData = await cache.get(cacheKey);

  if (storedMetaData) {
    const { ts, channel } = storedMetaData;
    const res = await slackWorkspace.botClient.chat.update({ ts, channel, attachments });
    context.log(res, 'Updated Slack message');
  } else if (context.payload.action === 'created') {
    const messageResponse = await sendMessageToChannel({
      slackWorkspace,
      subscription,
      context,
      issue,
      message: { attachments },
    });

    const messageMetaData = {
      channel: messageResponse.channel,
      ts: messageResponse.ts,
    };
    await cache.set(cacheKey, messageMetaData);
  }
};
