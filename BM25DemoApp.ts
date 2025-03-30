import {
    IAppAccessors,
    ILogger,
    IRead,
    IModify,
    IHttp,
    IPersistence,
} from '@rocket.chat/apps-engine/definition/accessors';
import { App } from '@rocket.chat/apps-engine/definition/App';
import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';
import { IMessage, IPostMessageSent } from '@rocket.chat/apps-engine/definition/messages';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';
import { IUser } from '@rocket.chat/apps-engine/definition/users';

class BM25 {
    private k1 = 1.0;
    private b = 0.75;
    private docs: string[];
    private docTermFreqs: Map<string, number>[];
    private docLengths: number[];
    private avgDocLength: number;
    private idf: Map<string, number>;

    constructor(docs: string[]) {
        this.docs = docs;
        this.docTermFreqs = [];
        this.docLengths = [];

        for (const doc of docs) {
            const terms = this.tokenize(doc);
            const termFreq = new Map<string, number>();
            for (const term of terms) {
                termFreq.set(term, (termFreq.get(term) || 0) + 1);
            }
            this.docTermFreqs.push(termFreq);
            this.docLengths.push(terms.length);
        }

        this.avgDocLength = this.docLengths.reduce((a, b) => a + b, 0) / docs.length || 1;
        this.idf = this.calculateIDF();
    }

    private tokenize(text: string): string[] {
        const stopWords = new Set(['i', 'is', 'my', 'what', 'how', 'do','why', 'the', 'a', 'an', 'to', 'for', 'of', 'and', 'on', 'in', 'at']);
        return text.toLowerCase()
            .replace(/[^\w\s']/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2 && !stopWords.has(t));
    }

    private calculateIDF(): Map<string, number> {
        const idf = new Map<string, number>();
        const totalDocs = this.docs.length;
        const termDocCount = new Map<string, number>();

        for (const doc of this.docTermFreqs) {
            for (const term of doc.keys()) {
                termDocCount.set(term, (termDocCount.get(term) || 0) + 1);
            }
        }

        for (const [term, count] of termDocCount) {
            idf.set(term, Math.log((totalDocs - count + 0.5) / (count + 0.5) + 1));
        }
        return idf;
    }

    public score(query: string): { index: number; score: number }[] {
        const queryTerms = this.tokenize(query);
        if (!queryTerms.length) return [{ index: 0, score: 0 }];

        const scores: { index: number; score: number }[] = [];

        for (let i = 0; i < this.docs.length; i++) {
            const termFreq = this.docTermFreqs[i];
            let score = 0;

            for (const term of queryTerms) {
                const tf = termFreq.get(term) || 0;
                const idf = this.idf.get(term) || 0;
                const docLength = this.docLengths[i];
                score += idf * ((tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * docLength / this.avgDocLength)));
            }
            scores.push({ index: i, score });
        }

        return scores.sort((a, b) => b.score - a.score);
    }
}

export class DemoApp extends App implements IPostMessageSent {
    private generalChannelId: string | undefined;
    private botUser: IUser | undefined;
    private faqQuestions: string[] = [
        "What is Rocket.Chat?",
        "How do I set up my account?",
        "What is the company's address?",
        "How do I reset my password?",
        "Why do I see a MongoDB deprecated warning immediately after an update?",
        "How do I handle Snap-related questions?",
        "When will my snap installation get the latest release?",
        "What causes slow connections or iOS connection errors?",
        "How can I extend my workspace's functionality?",
        "Is there a plugin framework in Rocket.Chat?",
        "What programming language does Rocket.Chat use?",
        "Why have I been given a trial on my community plan workspace?",
        "What happens when I downgrade my workspace plan?",
        "How does the fair use allowance work?"
    ];
    
    private faqAnswers: string[] = [
        "Rocket.Chat is an open-source communication platform for team collaboration.",
        "To set up your account, go to the settings page and fill in your details.",
        "Our address is 123 Main Street, Anytown, USA.",
        "To reset your password, click 'Forgot Password' on the login page and follow the instructions.",
        "This is due to your MongoDB version not being compatible with the installed Rocket.Chat version. Incrementally upgrade the version.",
        "Ask them in the #ubuntu-snap channel on our community forums.",
        "Snaps are auto-updating, and we ensure stability before releasing updates.",
        "95% or more are due to improperly configured reverse proxies where WebSocket is not working properly.",
        "Submit a pull request, use integrations, or build a Rocket.Chat app, each with different strengths.",
        "No, we use apps instead of a plugin framework for extending functionality.",
        "Rocket.Chat uses TypeScript only for development.",
        "To enhance your experience and showcase premium plan features.",
        "Downgrading changes features; understand these for a smooth transition.",
        "It’s a temporary flexibility to accommodate extra users beyond the licensed limit without service disruption."
    ];
    private bm25: BM25;

    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {
        super(info, logger, accessors);
        this.bm25 = new BM25(this.faqQuestions);
    }

    public async initialize(): Promise<void> {
        const generalRoom: IRoom | undefined = await this.getAccessors()
            .reader.getRoomReader()
            .getByName('general');
        if (!generalRoom) {
            this.getLogger().error('Could not find channel');
            return;
        }
        this.generalChannelId = generalRoom.id;

        this.botUser = await this.getAccessors()
            .reader.getUserReader()
            .getAppUser();
        if (!this.botUser) {
            this.getLogger().error('Could not bot user');
            return;
        }

        this.getLogger().info('DemoApp :))');
    }

    public async checkPostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp
    ): Promise<boolean> {
        if (!message.text || !this.generalChannelId || !this.botUser) {
            return false;
        }
        return message.room.id === this.generalChannelId && message.sender.id !== this.botUser.id;
    }

    public async executePostMessageSent(
        message: IMessage,
        read: IRead,
        http: IHttp,
        persistence: IPersistence,
        modify: IModify
    ): Promise<void> {
        if (!message.text || !this.generalChannelId || !this.botUser) {
            return;
        }

        const query = message.text;
        const scores = this.bm25.score(query);
        const topMatch = scores[0];

        let responseText: string;
        const threshold = 5.0;
        if (topMatch && topMatch.score >= threshold) {
            responseText = `${this.faqAnswers[topMatch.index]} (score: ${topMatch.score.toFixed(3)})`;
        } else {
            responseText = `Sorry, no answer found! (score: ${topMatch ? topMatch.score.toFixed(3) : 0})`;
        }

        const response = modify.getCreator()
            .startMessage()
            .setRoom(message.room)
            .setSender(this.botUser)
            .setText(responseText);

        try {
            await modify.getCreator().finish(response);
            this.getLogger().info(`"${query}" - "${responseText}"`);
        } catch (error) {
            this.getLogger().error(`Failed : ${error}`);
        }
    }
}
