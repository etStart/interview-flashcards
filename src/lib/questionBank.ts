import rawBank from "../../all_questions.json";
import { getProgressRecord, isDue } from "./progress";
import type { Category, DeckEntry, Group, ProgressMap, RawBank, StudyMode } from "../types";

export const questionBank = (() => {
  const source = rawBank as RawBank;

  return {
    groups: source.groups,
    categories: source.categories.map((category) => ({
      id: category.id,
      name: category.name,
      description: category.description,
      cards: category.cards.map((card) => ({
        id: card.id,
        q: card.q,
        a: card.a,
        cn: card.cn ?? "",
        tag: card.tag ?? "",
      })),
    })),
  };
})();

export function getCategoriesForGroup(group: Group): Category[] {
  return questionBank.categories.filter((category) => group.categoryIds.includes(category.id));
}

function shuffle<T>(items: T[]): T[] {
  const cloned = [...items];

  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }

  return cloned;
}

export function buildDeck(group: Group, categoryIds: string[], mode: StudyMode, progressMap: ProgressMap): DeckEntry[] {
  const selectedCategoryIds = new Set(categoryIds);
  const categories = getCategoriesForGroup(group).filter((category) => selectedCategoryIds.has(category.id));

  const entries = categories.flatMap((category) =>
    category.cards.map((card) => ({
      card,
      categoryId: category.id,
      categoryName: category.name,
      groupId: group.id,
      groupName: group.name,
    })),
  );

  const filtered = entries.filter((entry) => {
    const progress = getProgressRecord(entry.card.id, progressMap);

    if (mode === "due") return isDue(progress);
    if (mode === "unseen") return progress.level === 0;
    if (mode === "forgotten") return progress.level === 1;

    return true;
  });

  return mode === "random" ? shuffle(filtered).slice(0, 10) : filtered;
}
