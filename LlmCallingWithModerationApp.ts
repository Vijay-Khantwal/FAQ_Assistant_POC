import {
    IAppAccessors,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
    IUIKitSurfaceViewParam,
} from "@rocket.chat/apps-engine/definition/accessors";
import { App } from "@rocket.chat/apps-engine/definition/App";
import {
    IMessage,
    IPostMessageSent,
} from "@rocket.chat/apps-engine/definition/messages";
import { IAppInfo } from "@rocket.chat/apps-engine/definition/metadata";
import { IRoom, RoomType } from "@rocket.chat/apps-engine/definition/rooms";
import {
    UIKitBlockInteractionContext,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import { ButtonElement, SectionBlock, ActionsBlock } from "@rocket.chat/ui-kit";
import { UIKitSurfaceType } from "@rocket.chat/apps-engine/definition/uikit";

import {
    IUIKitResponse,
    UIKitActionButtonInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";

export class MyRocketChatApp extends App implements IPostMessageSent {
    private moderatorUsername = "superPlayer421";
    private geminiApiKey = "Key Here";

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }
    public async checkPostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp
    ): Promise<boolean> {
        // this.getLogger().debug(`checkPostMessageSent triggered for message: ${message.text} by ${message.sender.username}`);
        if (!message.text) return false;
        if(message.sender.username === "faq-assistant.bot") {
            return false;
        }

        if (message.sender.username === this.moderatorUsername) {
            // this.getLogger().debug("Message is from Moderator.");
            return message.text.startsWith("APPROVE:");
        }

        return message.text.endsWith("?");
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        // this.getLogger().debug(`executePostMessageSent triggered for message: ${message.text} by ${message.sender.username}`);
        if (!message.text) return;

        const user = message.sender.username;
        if (user === this.moderatorUsername) {
            // this.getLogger().debug("Message is from Moderator.");

            if (message.text.startsWith("APPROVE:")) {
                const parts = message.text
                    .replace("APPROVE:", "")
                    .trim()
                    .split(" ");
                const originalMessageId = parts.shift();
                const approvedResponse = parts.join(" ").trim();

                if (originalMessageId && approvedResponse) {
                    // this.getLogger().debug(`Approving message: ${originalMessageId} with response: ${approvedResponse}`);
                    await this.sendApprovedResponse(
                        originalMessageId,
                        approvedResponse,
                        read,
                        modify
                    );
                }
            }
            return;
        }

        if (!message.text.endsWith("?")) return;

        // this.getLogger().debug(`Fetching response for question: ${message.text}`);
        const geminiResponse = await this.getGeminiAnswer(message.text, http);
        // this.getLogger().debug(`Gemini Response Received: ${geminiResponse}`);

        await this.sendToModerator(
            message.id || "",
            geminiResponse,
            read,
            modify
        );
    }
    public async executeBlockActionHandler(
        context: UIKitBlockInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<IUIKitResponse> {
        this.getLogger().debug("executeBlockActionHandler triggered");

        const { actionId, value, user, triggerId } =
            context.getInteractionData();
        this.getLogger().debug(
            `Received Action ID: ${actionId} | Value: ${value}`
        );

        if (!value) return context.getInteractionResponder().errorResponse();

        try {
            const { messageId, response } = JSON.parse(value);

            if (actionId.startsWith("approve_response_")) {
                this.getLogger().debug(
                    `Approving response for Message ID: ${messageId}`
                );
                await this.sendApprovedResponse(
                    messageId,
                    response,
                    read,
                    modify
                );
            } else if (actionId.startsWith("edit_response_")) {
                this.getLogger().debug(
                    `Editing response for Message ID: ${messageId}`
                );

                const modal: IUIKitSurfaceViewParam = {
                    type: UIKitSurfaceType.MODAL,
                    title: { 
                        text: 'Edit Response', 
                        type: 'plain_text' },
                    submit: {
                        type : "button",
                        text: {
                            type: "plain_text",
                            text: "Submit",
                            emoji: true
                        },
                        value: "submit",
                        actionId: "submit",
                        blockId: "response_block",
                        appId: this.getID()
                    },  
                    close: {
                        type : "button",
                        text: {
                            type: "plain_text",
                            text: "Close",
                            emoji: true
                        },
                        value: "close",
                        actionId: "close",
                        blockId: "response_block",
                        appId: this.getID()
                    },
                    blocks: [
                        {
                            type: 'input',
                            blockId: 'response_block',
                            element: {
                                type: 'plain_text_input',
                                initialValue: `APPROVE: ${messageId} ${response}`,
                                multiline: true,
                                appId: this.getID(),
                                blockId: 'response_block',
                                actionId: 'edited_response'
                            },
                            label: {
                                type: 'plain_text',
                                text: 'Edit the response:',
                                emoji: true
                            }
                        }
                    ]
                };

                await modify.getUiController().openSurfaceView(
                    modal,
                    { triggerId: triggerId! },
                    user
                );
            }
        } catch (error) {
            this.getLogger().error("Error handling block action:", error);
            return context.getInteractionResponder().errorResponse();
        }

        return context.getInteractionResponder().successResponse();
    }

    public async executeViewSubmitHandler(
        context: UIKitViewSubmitInteractionContext,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<IUIKitResponse> {
        try {
            const { view, user } = context.getInteractionData();

            
            // const inputBlock = view.blocks[0] as any; 
            // const editedText = inputBlock?.element?.initialValue;
            
            const state = view.state as any; 
            const editedText = state?.response_block?.edited_response; 
            this.getLogger().debug(`Edited response: ${editedText}` , user);

            if (editedText.startsWith("APPROVE:")) {
                const parts = editedText
                    .replace("APPROVE:", "")
                    .trim()
                    .split(" ");
                const originalMessageId = parts.shift();
                const approvedResponse = parts.join(" ").trim();

                if (originalMessageId && approvedResponse) {
                    // this.getLogger().debug(`Approving message: ${originalMessageId} with response: ${approvedResponse}`);
                    await this.sendApprovedResponse(
                        originalMessageId,
                        approvedResponse,
                        read,
                        modify
                    );
                }
            }
            
            this.getLogger().debug("Modal submit successful." , editedText);

            return context.getInteractionResponder().successResponse();
        } catch (error) {
            this.getLogger().error("Modal submit error:", error);
            return context.getInteractionResponder().errorResponse();
        }
    }

    private async getGeminiAnswer(
        question: string,
        http: IHttp
    ): Promise<string> {
        try {
            // this.getLogger().debug(`Fetchingres for question: ques  here`);

            const response = await http.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.geminiApiKey}`,
                {
                    headers: { "Content-Type": "application/json" },
                    data: {
                        contents: [
                            {
                                parts: [
                                    {
                                        text: `${question} Answer concisely in no more than 100 words.`,
                                    },
                                ],
                            },
                        ],
                    },
                }
            );

            const answer =
                response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
                "I couldn’t find a proper answer. Try rephrasing!";
            // this.getLogger().debug(`Gemini API Response: idhar aaega`);
            return answer;
        } catch (error) {
            this.getLogger().debug("Error contacting Gemini API:", error);
            return "There was an issue contacting the AI assistant.";
        }
    }

    private async sendToModerator(
        messageId: string,
        response: string,
        read: IRead,
        modify: IModify
    ): Promise<void> {
        this.getLogger().debug(
            `Sending message ID: ${messageId} to moderator for approval`
        );

        const moderator = await read
            .getUserReader()
            .getByUsername(this.moderatorUsername);
        if (!moderator) {
            this.getLogger().error("Moderator not found!");
            return;
        }

        let room = await read
            .getRoomReader()
            .getDirectByUsernames([this.moderatorUsername]);
        if (!room) {
            // this.getLogger().debug("Creating a new DM room for Moderator.");
            const roomId = await modify
                .getCreator()
                .finish(
                    modify
                        .getCreator()
                        .startRoom()
                        .setType(RoomType.DIRECT_MESSAGE)
                        .setCreator(moderator)
                );
            const fetchedRoom = await read.getRoomReader().getById(roomId);
            if (!fetchedRoom) {
                // this.getLogger().error("Failed to create Moderator room."); Gemini API response fo
                return;
            }
            room = fetchedRoom;
        }

        const blocks: Array<SectionBlock | ActionsBlock> = [];

        const sectionBlock: SectionBlock = {
            type: "section",
            text: {
                type: "mrkdwn",
                text: `**MODERATION NEEDED:**\nOriginal Message ID: ${messageId}\nSuggested Response: ${response}`,
            },
        };

        const approveButton: ButtonElement = {
            type: "button",
            text: {
                type: "plain_text",
                text: "Approve & Send",
                emoji: true,
            },
            value: JSON.stringify({ messageId, response }),
            actionId: `approve_response_${messageId}`,
            appId: this.getID(),
            blockId: `block_${messageId}`,
            style: "success",
        };

        const editButton: ButtonElement = {
            type: "button",
            text: {
                type: "plain_text",
                text: "Edit Before Sending",
                emoji: true,
            },
            value: JSON.stringify({ messageId, response }),
            actionId: `edit_response_${messageId}`,
            appId: this.getID(),
            blockId: `block_${messageId}`,
            style: "primary",
        };

        const actionsBlock: ActionsBlock = {
            type: "actions",
            elements: [approveButton, editButton],
        };

        blocks.push(sectionBlock);
        blocks.push(actionsBlock);

        const msg = modify
            .getCreator()
            .startMessage()
            .setRoom(room)
            .addBlocks(blocks);

        await modify.getCreator().finish(msg);
        this.getLogger().debug("Message sent to moderator successfully.");
    }

    private async sendApprovedResponse(
        originalMessageId: string,
        approvedResponse: string,
        read: IRead,
        modify: IModify
    ): Promise<void> {
        this.getLogger().debug(
            `Sending approved response for Message ID: ${originalMessageId}`
        );

        const message = await read
            .getMessageReader()
            .getById(originalMessageId);
        if (!message) {
            this.getLogger().error("Original message not found!");
            return;
        }

        this.getLogger().debug("Approved response sent successfully.");
        try {
            const msg = modify
                .getCreator()
                .startMessage()
                .setRoom(message.room)
                .setText(`@${message.sender.username} ${approvedResponse}`);
            await modify.getCreator().finish(msg);
        } catch (e) {
            this.getLogger().error("Error sending message", e);
        }
    }
}
