export interface IvrSummary {
  id: number;
  number: string;
  name: string;
  ivrType: string;
  promptFilename: string | null;
  groups: Array<{ groupId: number; name: string }>;
}

export interface IvrDetail {
  id: number;
  number: string;
  name: string;
  ivrType: string;
  timeout: number;
  promptFilename: string | null;
  outOfOfficeRoute: { prompt: string; isPromptEnabled: boolean };
  breakRoute: { prompt: string; isPromptEnabled: boolean };
  holidaysRoute: { prompt: string; isPromptEnabled: boolean };
  forwards: IvrForward[];
  groups: Array<{ groupId: number; name: string }>;
}

export interface IvrForward {
  id: number;
  input: string;
  forwardType: string;
  forwardDN: string;
  peerType?: string;
  customData?: string;
}

export type PromptType = 'main' | 'offHours' | 'holidays' | 'break';
