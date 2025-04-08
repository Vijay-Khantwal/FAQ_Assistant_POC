import {
    ISetting,
    SettingType,
} from '@rocket.chat/apps-engine/definition/settings';
export const settings: ISetting[] = [
    {
        id: 'monitor-channels',
        i18nLabel: 'Monitor Channels',
        i18nDescription: 'Select channels to monitor messages for FAQ matching',
        type: SettingType.ROOM_PICK,
        values: [], 
        required: false,
        public: true,
        packageValue: [],
    },
    {
        id: 'model',
        i18nLabel: 'Model selection',
        i18nDescription: 'AI model to use for generation.',
        type: SettingType.SELECT,
        values: [
            { key: 'llama3-8b.local:1234', i18nLabel: 'Llama3 8B' },
            { key: 'mistral-7b:1234', i18nLabel: 'Mistral 7B' },
        ],
        required: true,
        public: true,
        packageValue: 'llama3-8b.local:1234',
    },
    {
        id: 'API Key',
        i18nLabel: 'API Key',
        i18nDescription: 'API Key for the LLM',
        type: SettingType.STRING,
        required: true,
        public: true,
        packageValue: '',
    },
    {
        id: 'bot-behavior',
        i18nLabel: 'Auto Reply',
        i18nDescription: 'Feature to enable auto-reply on fully matched FAQs',
        type: SettingType.BOOLEAN,
        required: false,
        public: true,
        packageValue: '',
    },
];
