export type ReviewLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type ReviewResult = "good" | "blur" | "bad";
export type StudyMode = "due" | "all" | "unseen" | "forgotten" | "random";

export type QuestionCard = {
  id: string;
  q: string;
  a: string;
  cn?: string;
  tag?: string;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  cards: QuestionCard[];
};

export type Group = {
  id: string;
  name: string;
  categoryIds: string[];
};

export type ProgressRecord = {
  cardId: string;
  level: ReviewLevel;
  lastReviewAt: string | null;
  nextReviewAt: string | null;
  editedAnswer: string | null;
  isHidden: boolean;
  updatedAt: string;
};

export type ProgressMap = Record<string, ProgressRecord>;

export type SyncInfo = {
  mode: "local" | "cloud";
  configured: boolean;
  userEmail: string | null;
  lastSyncedAt: string | null;
  message: string | null;
};

export type DeckEntry = {
  card: QuestionCard;
  categoryId: string;
  categoryName: string;
  groupId: string;
  groupName: string;
};

export type StudyAnswer = {
  cardId: string;
  result: ReviewResult;
  nextLevel: ReviewLevel;
};

export type StudySession = {
  groupId: string;
  groupName: string;
  mode: StudyMode;
  cards: DeckEntry[];
  index: number;
  answers: StudyAnswer[];
};

export type BackupFile = {
  version: 1;
  exportedAt: string;
  progress: ProgressRecord[];
};

export type RawBank = {
  groups: Group[];
  categories: Array<
    Omit<Category, "cards"> & {
      cards: Array<QuestionCard & { mastery?: number }>;
    }
  >;
};

export type UserProgressRow = {
  user_id: string;
  card_id: string;
  level: number;
  last_review_at: string | null;
  next_review_at: string | null;
  edited_answer: string | null;
  is_hidden: boolean;
  updated_at: string;
};
