import { useEffect, useState } from "react";
import {
  describeResultPreview,
  formatNextReview,
  getEditedAnswer,
  getProgressRecord,
} from "../lib/progress";
import type { DeckEntry, ProgressMap, ReviewResult, StudySession } from "../types";

type StudyViewProps = {
  session: StudySession;
  progressMap: ProgressMap;
  onBack: () => void;
  onRate: (card: DeckEntry, result: ReviewResult) => void;
  onSaveAnswer: (card: DeckEntry, answer: string | null) => Promise<void>;
  onHideCard: (card: DeckEntry) => Promise<void>;
};

export default function StudyView(props: StudyViewProps) {
  const { session, progressMap, onBack, onRate, onSaveAnswer, onHideCard } = props;
  const currentCard = session.cards[session.index];
  const currentProgress = currentCard ? getProgressRecord(currentCard.card.id, progressMap) : null;
  const [isFlipped, setIsFlipped] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isHiding, setIsHiding] = useState(false);
  const [draftAnswer, setDraftAnswer] = useState(
    currentCard && currentProgress ? getEditedAnswer(currentCard.card, currentProgress) : "",
  );

  useEffect(() => {
    if (!currentCard || !currentProgress) return;

    setIsFlipped(false);
    setIsEditing(false);
    setIsSaving(false);
    setIsHiding(false);
    setDraftAnswer(getEditedAnswer(currentCard.card, currentProgress));
  }, [currentCard?.card.id, currentProgress?.editedAnswer]);

  if (!currentCard || !currentProgress) {
    const summary = session.answers.reduce(
      (accumulator, answer) => {
        accumulator[answer.result] += 1;
        return accumulator;
      },
      { good: 0, blur: 0, bad: 0 },
    );

    return (
      <div className="screen">
        <button className="ghost-button" onClick={onBack}>
          返回首页
        </button>

        <section className="completion-card">
          <span className="eyebrow">训练完成</span>
          <h2>{session.groupName} 已完成</h2>
          <p>这一轮训练已经结束，可以回到首页继续下一组。</p>

          <div className="completion-grid">
            <div>
              <span>记住了</span>
              <strong>{summary.good}</strong>
            </div>
            <div>
              <span>模糊</span>
              <strong>{summary.blur}</strong>
            </div>
            <div>
              <span>忘了</span>
              <strong>{summary.bad}</strong>
            </div>
          </div>

          <button className="primary-button" onClick={onBack}>
            返回首页
          </button>
        </section>
      </div>
    );
  }

  const progressPercent = Math.round((session.index / session.cards.length) * 100);

  async function handleSave() {
    const cleaned = draftAnswer.trim();
    const nextAnswer = cleaned === currentCard.card.a.trim() ? null : cleaned;

    setIsSaving(true);
    try {
      await onSaveAnswer(currentCard, nextAnswer);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleHide() {
    const confirmed = window.confirm("隐藏后这道题将不再出现在你的学习中，确定继续吗？");
    if (!confirmed) return;

    setIsHiding(true);
    try {
      await onHideCard(currentCard);
    } finally {
      setIsHiding(false);
    }
  }

  return (
    <div className="screen study-screen">
      <button className="ghost-button" onClick={onBack}>
        返回首页
      </button>

      <header className="study-header">
        <div>
          <span className="eyebrow">{session.groupName}</span>
          <h2>
            {session.index + 1} / {session.cards.length}
          </h2>
        </div>
        <div className="study-meta">
          <span className="pill">{currentCard.categoryName}</span>
          <span className="pill subtle">Lv{currentProgress.level}</span>
        </div>
      </header>

      <div className="progress-bar large">
        <span style={{ width: `${progressPercent}%` }} />
      </div>

      <section className={`flashcard ${isFlipped ? "flipped" : ""}`}>
        <button className="card-face card-front" onClick={() => setIsFlipped(true)}>
          <span className="card-kicker">问题</span>
          <h3>{currentCard.card.q}</h3>
          <span className="card-hint">点击翻面查看答案</span>
        </button>

        <div className="card-face card-back">
          <div className="card-back-head">
            <span className="card-kicker">答案</span>
            <button className="text-button" onClick={() => setIsFlipped(false)}>
              收起答案
            </button>
          </div>

          {currentCard.card.cn ? <p className="translation">{currentCard.card.cn}</p> : null}

          {isEditing ? (
            <textarea
              className="answer-editor"
              value={draftAnswer}
              onChange={(event) => setDraftAnswer(event.target.value)}
            />
          ) : (
            <pre className="answer-text">{getEditedAnswer(currentCard.card, currentProgress)}</pre>
          )}

          <div className="answer-meta">
            <span>下次复习</span>
            <strong>{formatNextReview(currentProgress.nextReviewAt)}</strong>
          </div>

          <div className="edit-actions">
            {isEditing ? (
              <>
                <button className="secondary-button" onClick={() => setIsEditing(false)}>
                  取消
                </button>
                <button className="secondary-button" onClick={() => setDraftAnswer(currentCard.card.a)}>
                  恢复默认
                </button>
                <button className="primary-button" disabled={isSaving} onClick={handleSave}>
                  {isSaving ? "保存中..." : "保存答案"}
                </button>
              </>
            ) : (
              <>
                <button className="secondary-button" onClick={() => setIsEditing(true)}>
                  编辑答案
                </button>
                <button className="secondary-button" disabled={isHiding} onClick={handleHide}>
                  {isHiding ? "隐藏中..." : "删除此题"}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {isFlipped && !isEditing ? (
        <section className="review-panel">
          <h3>这次记忆反馈</h3>
          <div className="review-grid">
            <button className="review-button danger" onClick={() => onRate(currentCard, "bad")}>
              <span>忘了</span>
              <strong>{describeResultPreview(currentProgress, "bad")}</strong>
            </button>
            <button className="review-button warn" onClick={() => onRate(currentCard, "blur")}>
              <span>模糊</span>
              <strong>{describeResultPreview(currentProgress, "blur")}</strong>
            </button>
            <button className="review-button success" onClick={() => onRate(currentCard, "good")}>
              <span>记住了</span>
              <strong>{describeResultPreview(currentProgress, "good")}</strong>
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
