import { useEffect, useState } from "react";
import { getProgressRecord, isDue } from "../lib/progress";
import { getCategoriesForGroup } from "../lib/questionBank";
import type { Group, ProgressMap, StudyMode } from "../types";

type GroupViewProps = {
  group: Group;
  progressMap: ProgressMap;
  onBack: () => void;
  onStart: (categoryIds: string[], mode: StudyMode) => void;
};

export default function GroupView(props: GroupViewProps) {
  const { group, progressMap, onBack, onStart } = props;
  const categories = getCategoriesForGroup(group);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState(categories.map((category) => category.id));

  useEffect(() => {
    setSelectedCategoryIds(categories.map((category) => category.id));
  }, [group.id]);

  const selectedCards = categories
    .filter((category) => selectedCategoryIds.includes(category.id))
    .flatMap((category) => category.cards)
    .filter((card) => !getProgressRecord(card.id, progressMap).isHidden);

  const modeCounts = {
    due: selectedCards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length,
    all: selectedCards.length,
    unseen: selectedCards.filter((card) => getProgressRecord(card.id, progressMap).level === 0).length,
    forgotten: selectedCards.filter((card) => getProgressRecord(card.id, progressMap).level === 1).length,
    random: Math.min(10, selectedCards.length),
  };

  function toggleCategory(categoryId: string) {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((item) => item !== categoryId)
        : [...current, categoryId],
    );
  }

  return (
    <div className="screen">
      <button className="ghost-button" onClick={onBack}>
        返回首页
      </button>

      <header className="group-header">
        <div>
          <span className="eyebrow">分组</span>
          <h2>{group.name}</h2>
          <p>选择要练习的分类与模式。</p>
        </div>
        <span className="pill">已选 {selectedCards.length} 张卡片</span>
      </header>

      <section className="panel">
        <div className="panel-head">
          <h3>分类</h3>
          <button className="text-button" onClick={() => setSelectedCategoryIds(categories.map((category) => category.id))}>
            全选
          </button>
        </div>

        <div className="category-list">
          {categories.map((category) => {
            const visibleCards = category.cards.filter((card) => !getProgressRecord(card.id, progressMap).isHidden);
            const dueCount = visibleCards.filter((card) => isDue(getProgressRecord(card.id, progressMap))).length;
            const selected = selectedCategoryIds.includes(category.id);

            return (
              <button
                className={`category-chip ${selected ? "selected" : ""}`}
                key={category.id}
                onClick={() => toggleCategory(category.id)}
              >
                <strong>{category.name}</strong>
                <span>
                  {visibleCards.length} 张卡片 / {dueCount} 待复习
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>模式</h3>
          <span className="pill subtle">已选 {selectedCards.length} 张卡片</span>
        </div>

        <div className="mode-grid">
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "due")}>
            <span>今日到期</span>
            <strong>{modeCounts.due}</strong>
          </button>
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "all")}>
            <span>全部卡片</span>
            <strong>{modeCounts.all}</strong>
          </button>
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "unseen")}>
            <span>未学习</span>
            <strong>{modeCounts.unseen}</strong>
          </button>
          <button className="mode-card" onClick={() => onStart(selectedCategoryIds, "forgotten")}>
            <span>忘了 Lv1</span>
            <strong>{modeCounts.forgotten}</strong>
          </button>
          <button className="mode-card wide" onClick={() => onStart(selectedCategoryIds, "random")}>
            <span>随机 10 题</span>
            <strong>{modeCounts.random}</strong>
          </button>
        </div>
      </section>
    </div>
  );
}
