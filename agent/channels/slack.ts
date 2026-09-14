import { connectSlackCredentials } from "@vercel/connect/eve";
import { slackChannel } from "eve/channels/slack";

const connectorUid =
  process.env.SLACK_CONNECTOR?.trim() || "slack/jelou-eve-agent";

/** Solo responde en este canal. Déjalo vacío para permitir todos (no recomendado). */
const allowedChannel = process.env.SLACK_ALLOWED_CHANNEL?.trim() || "";

function isAllowedChannel(channelId: string) {
  if (!allowedChannel) return true;
  return channelId === allowedChannel;
}

export default slackChannel({
  credentials: connectSlackCredentials(connectorUid),
  threadContext: { since: "last-agent-reply" },

  async onAppMention(ctx, message) {
    if (!isAllowedChannel(message.channelId)) return null;
    if (message.author?.isBot) return null;
    return { auth: null };
  },

  async onDirectMessage(_ctx, _message) {
    // Solo canal configurado: ignorar DMs.
    return null;
  },

  async onMessage(ctx, message) {
    if (!isAllowedChannel(message.channelId)) return null;
    if (message.author?.isBot) return null;

    const shouldHandle =
      ctx.isBotMentioned() || (await ctx.isSubscribed());

    return shouldHandle ? { auth: null } : null;
  },
});
