import {
    IAppAccessors,
    IHttp,
    ILogger,
    IModify,
    IPersistence,
    IRead,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';


export class FaqAssistantApp extends App implements IPostMessageSent {
    private monitoredChannels = new Set(['GENERAL']);
    private faqMap = new Map<string, string>([
        ['how to contribute?', 'Check our CONTRIBUTING.md file!'],
        ['installation guide', 'See README.md for installation steps'],
        ['report bug', 'Please create a GitHub issue']
    ]);

    constructor(info: IAppInfo, logger: any, accessors: IAppAccessors) {
        super(info, logger, accessors);
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        try {
            if (message.sender.username === this.getName() || 
                !this.monitoredChannels.has(message.room.id)) {
                return;
            }

            const msg : string = message.text || "";
            const isQuestion = msg.trim().endsWith('?');
            
            if (!isQuestion) return;

            const response = this.findBestAnswer(msg.toLowerCase());

            const messageBuilder = modify.getCreator().startMessage()
                .setText(response)
                .setRoom(message.room)
                .setSender(await read.getUserReader().getById('rocket.cat'));

            await modify.getCreator().finish(messageBuilder);
        } catch (error) {
            console.error('Error:', error);
        }
    }

    private findBestAnswer(question: string): string {
        for (const [keyword, answer] of this.faqMap) {
            if (question.includes(keyword)) {
                return answer;
            }
        }
        return 'Oops! I don\'t have an answer for that yet.';
    }
}
