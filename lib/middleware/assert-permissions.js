const { GitHubAppPermissionUpdate } = require('../messages/flow');
const { Installation } = require('../models');
const logger = require('../logger');

module.exports = (originalFunction, permissions) => async (req, res, next) => {
  // Check for permission update needed ONLY if function returns HTTP 403 or 404
  try {
    await originalFunction(req, res, next);
  } catch (err) {
    logger.debug({ err }, 'Error received during request.');
    if (err.status === 403 || err.status === 404) {
      const {
        command,
        robot,
        resource,
        slackWorkspace,
        channel,
      } = res.locals;
      const { owner, repo } = resource;
      const github = await robot.auth();
      const installation = res.locals.installation || await Installation.sync(github, resource);
      const hasPermissions = await Installation.assertPermissions(github, {
        owner,
        repo,
        permissions,
        installation,
      });
      // Other error, let middleware handle it
      if (hasPermissions) {
        throw err;
      }
      // App doesn't have permissions
      if (command) {
        // eslint-disable-next-line max-len
        return command.respond(new GitHubAppPermissionUpdate({ installation }));
      }

      // No command to respond to, send message through slack client (i.e. dialog submission)
      await slackWorkspace.botClient.chat.postMessage({
        channel,
        ...new GitHubAppPermissionUpdate({ installation }).toJSON(),
      });

      res.send();
    }
  }
};
