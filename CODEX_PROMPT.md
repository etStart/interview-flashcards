# 面試背題卡 - 完整 PRD + Codex 開發指令

## 🎯 專案概述

製作一個**單一 HTML 檔案**的面試刷題卡應用。下載到手機/電腦，雙擊即可開啟，無需網路、無需部署。

---

## 📦 技術規格

- 純 HTML + CSS + JavaScript（單檔案）
- 無外部依賴（字體可用 Google Fonts CDN）
- 所有資料存在 `localStorage`
- 題庫 JSON 內嵌在 `<script>` 標籤內

---

## 🗂 資料結構

題庫 JSON 格式如下，直接內嵌進 HTML：

```javascript
const QUESTION_DB = {
  "categories": [
    {
      "id": "jp_basic",
      "name": "🇯🇵 基本面接問題",
      "description": "日本語面接でよく聞かれる基本質問34問",
      "cards": [
        {
          "id": "jp1_0",
          "q": "いつ日本に来ましたか？",
          "a": "2025年5月に渡航予定です...",
          "cn": "你什么时候来日本的？",
          "mastery": 0
        }
        // ... 更多題目
      ]
    }
    // ... 更多分類
  ]
}
```

**mastery 值說明：**
- `0` = 未做（灰色）
- `1` = 不會（紅色 ❌）
- `2` = 模糊（黃色 🤔）
- `3` = 會了（綠色 ✅）

---

---

## 🧠 艾賓浩斯間隔複習（SRS）

### 複習間隔表

| 等級 | 答對後升到 | 答錯後降到 | 下次複習間隔 |
|------|-----------|-----------|------------|
| 0（未學） | - | - | 立即 |
| 1 | 2 | 1 | 1天後 |
| 2 | 3 | 1 | 2天後 |
| 3 | 4 | 1 | 4天後 |
| 4 | 5 | 1 | 7天後 |
| 5 | 6 | 1 | 15天後 |
| 6 | 7 | 1 | 30天後 |
| 7（掌握） | 7 | 1 | 不再出現 |

### SRS 核心邏輯

```javascript
const SRS_INTERVALS = [0, 1, 2, 4, 7, 15, 30, Infinity]; // 天數

function reviewCard(cardId, result) {
  // result: 'good'(✅) | 'blur'(🤔) | 'bad'(❌)
  const srs = getSRS(cardId); // 從 localStorage 讀取
  const now = new Date();
  let newLevel = srs.level;

  if (result === 'good') {
    newLevel = Math.min(srs.level + 1, 7);
  } else if (result === 'blur') {
    newLevel = Math.max(srs.level, 1); // 等級不變，但重置計時
  } else if (result === 'bad') {
    newLevel = 1; // 打回第一級
  }

  const intervalDays = SRS_INTERVALS[newLevel];
  const nextReview = new Date(now);
  nextReview.setDate(nextReview.getDate() + intervalDays);

  saveSRS(cardId, {
    level: newLevel,
    lastReview: now.toISOString(),
    nextReview: nextReview.toISOString(),
    editedAnswer: srs.editedAnswer
  });
}

function isDue(cardId) {
  const srs = getSRS(cardId);
  if (srs.level === 0) return true;  // 未學過，算到期
  if (srs.level === 7) return false; // 完全掌握，不出現
  return new Date(srs.nextReview) <= new Date();
}

function getTodayDueCards(allCards) {
  return allCards.filter(card => isDue(card.id));
}
```

### 掌握度按鈕對應

| 按鈕 | 含義 | 動作 |
|------|------|------|
| ✅ 記住了 | 完全記得 | level +1，按間隔表設定下次 |
| 🤔 模糊 | 大概記得 | level 不變，明天再複習 |
| ❌ 忘了 | 完全不記得 | level 回到1，明天複習 |

---

## 📱 頁面結構（4個畫面）

### 畫面 1：首頁（Home）

```
┌─────────────────────────┐
│   面接フラッシュカード    │
│                         │
│  ┌── 📅 今日の復習 ───┐  │
│  │  12問 が期限切れ   │  │
│  │  [今すぐ復習する →]│  │  ← 跨分組，最優先
│  └───────────────────┘  │
│                         │
│  全体進捗: 20/68 掌握   │
│  [====------] 29%       │
│                         │
│  ── 題庫を選ぶ ──────── │
│                         │
│  ┌─────────────────┐   │
│  │🇯🇵 日語面試      │   │
│  │ 47問・今日5問到期│   │  ← 點進去選模式
│  └─────────────────┘   │
│  ┌─────────────────┐   │
│  │💻 技術題         │   │
│  │ 21問・7問到期    │   │
│  └─────────────────┘   │
│                         │
│     [📥 導入] [⚙️ 管理] │
└─────────────────────────┘
```

**首頁邏輯：**
- 「📅 今日の復習」：合並所有分組的到期題，統一刷
- 分組卡片：顯示該分組的總題數 + 今日到期數
- 點分組進入模式選單

**首頁功能：**
- 顯示各分類卡片（點擊進入學習）
- 顯示今日整體進度
- 「錯題復習」按鈕：只刷 mastery=1 的題
- 「導入」按鈕：批量導入新題目

---

### 畫面 2：模式選擇（Mode Select）

點擊分組後出現，可選擇範圍和模式：

```
┌─────────────────────────┐
│  🇯🇵 日語面試            │
│  47問（3分類合計）       │
│                         │
│  範囲:                  │
│  [● 全分類まとめて]      │  ← 預設，47題混刷
│  [  基本問題のみ(34)]    │
│  [  進阶問題のみ(8) ]    │
│  [  重点問題のみ(5) ]    │
│                         │
│  モード:                 │
│  [📅 今日の復習 (5問)]   │  ← SRS到期（優先）
│  [📚 全部順番]           │
│  [🔀 ランダム10問]       │
│  [❌ 忘れた題だけ]       │
│  [🌱 未学習だけ]         │
│                         │
│  [← 戻る]               │
└─────────────────────────┘
```

**模式選單邏輯：**
- 範圍預設「全分類まとめて」，也可以選單一分類
- 模式作用於選定範圍內的題目
- 「今日の復習」= 範圍內所有 isDue() 的題

---

### 畫面 3：刷題頁（Card View）— 核心畫面

```
┌─────────────────────────┐
│  ← 戻る    3 / 34       │
│  [========----] 75%     │
│                         │
│  ┌─────────────────┐   │
│  │                 │   │
│  │  いつ日本に     │   │
│  │  来ましたか？   │   │
│  │                 │   │
│  │  [タップして    │   │
│  │   答えを表示]   │   │
│  │                 │   │
│  └─────────────────┘   │
│                         │
│  （翻轉後顯示答案）       │
│                         │
│  ─────────────────────  │
│  どれくらい覚えましたか？│
│  [❌忘れた][🤔曖昧][✅覚えた]│
│                         │
│  次の復習:              │
│  ❌→ 明日  🤔→ 明日     │
│  ✅→ Lv3なら4日後       │
│                         │
│  [✏️ 答えを編集]         │
└─────────────────────────┘
```

**卡片互動：**
- 點擊卡片 → 翻轉動畫（CSS 3D flip）顯示答案
- 翻轉後出現掌握度按鈕
- 點掌握度按鈕 → 自動跳下一題
- 可顯示中文翻譯（cn 欄位，日語題才有）

---

### 畫面 4：批量導入頁（Import）

```
┌─────────────────────────┐
│  题目批量导入            │
│                         │
│  分类选择:               │
│  [💻 React技術問題 ▼]    │
│                         │
│  格式（每题用空行分隔）:  │
│  ┌─────────────────┐   │
│  │Q: 问题内容       │   │
│  │A: 答案内容       │   │
│  │                 │   │
│  │Q: 问题2         │   │
│  │A: 答案2         │   │
│  └─────────────────┘   │
│                         │
│  [解析预览]  [导入]      │
│                         │
│  预览: 解析到 3 道题     │
│  Q1: useEffect...       │
│  Q2: useState...        │
└─────────────────────────┘
```

---

## 💾 localStorage 設計

```javascript
// 存儲key
const STORAGE_KEY = 'flashcard_mastery';

// 存儲格式：{ cardId: masteryValue }
// 例：{ "jp1_0": 3, "jp1_1": 1, "tech_0": 2 }

// 自定義題目key
const CUSTOM_KEY = 'flashcard_custom';
// 格式：同 QUESTION_DB.categories 的 cards 陣列

// 答案修改key
const EDITED_KEY = 'flashcard_edits';
// 格式：{ cardId: "修改後的答案文字" }
```

---

## ✏️ 答案編輯功能

- 每張卡片答案面顯示「✏️ 答えを編集」按鈕
- 點擊後答案文字變成 `<textarea>` 可直接編輯
- 點「保存」後存入 `localStorage`（`EDITED_KEY`）
- 下次顯示時優先讀取 `EDITED_KEY` 的內容

---

## 📥 批量導入解析邏輯

```javascript
function parseImportText(text) {
  const blocks = text.trim().split(/\n\s*\n/); // 空行分隔
  const cards = [];
  blocks.forEach(block => {
    const lines = block.trim().split('\n');
    let q = '', a = '';
    lines.forEach(line => {
      if (line.startsWith('Q:')) q = line.replace('Q:', '').trim();
      if (line.startsWith('A:')) a = line.replace('A:', '').trim();
    });
    if (q && a) cards.push({ q, a });
  });
  return cards;
}
```

導入後的題目存入 `CUSTOM_KEY`，合併進對應分類顯示。

---

## 🎨 設計規格

**色彩：**
```css
--bg: #0f1117;           /* 深色背景 */
--surface: #1a1d27;      /* 卡片背景 */
--border: #2d3142;       /* 邊框 */
--text: #e8eaf0;         /* 主文字 */
--text-sub: #8892a4;     /* 副文字 */
--accent: #4f8ef7;       /* 主色（藍） */
--red: #f75555;          /* 不会 */
--yellow: #f7c355;       /* 曖昧 */
--green: #55c57a;        /* 会了 */
```

**卡片翻轉動畫：**
```css
.card { transition: transform 0.5s; transform-style: preserve-3d; }
.card.flipped { transform: rotateY(180deg); }
.card-front, .card-back { backface-visibility: hidden; }
.card-back { transform: rotateY(180deg); }
```

**字體：**
- 日文：Noto Sans JP（Google Fonts）
- 代碼：Fira Code 或 monospace

---

## ✅ 功能清單（MVP）

**核心刷題：**
- [x] 首頁顯示分組（日語面試 / 技術題）+ 整體進度
- [x] 模式選單支持「全分類合併」或「單一分類」範圍選擇
- [x] 卡片3D翻轉動畫（加 will-change: transform）
- [x] 答案可編輯並本地保存
- [x] 批量導入（Q:/A: 格式解析）
- [x] 日語題顯示中文翻譯（小字）
- [x] 🔊 TTS朗讀題目（Web Speech API，日語語音）
- [x] 評分頁加「↩️ 撤銷上一題」按鈕

**SRS 間隔複習：**
- [x] 首頁顯示「今日待複習N問」並優先導流（跨分組）
- [x] 每張卡片記錄 level / lastReview / nextReview
- [x] 三檔評分（✅覚えた / 🤔曖昧 / ❌忘れた）
- [x] 按評分結果更新等級和下次複習時間
- [x] 答完後顯示「下次複習: X天後」
- [x] 所有SRS數據存 localStorage，重開繼續

**數據安全：**
- [x] 管理頁面加「📤 導出備份」按鈕（下載完整JSON）
- [x] 管理頁面加「📥 導入備份」按鈕（恢復進度）

---

## 📋 題庫資料

**直接使用以下 JSON 作為 `QUESTION_DB`（完整資料見附件 `all_questions.json`）**

將 `all_questions.json` 的內容直接貼入 HTML 的 script 標籤：

```html
<script>
const QUESTION_DB = /* 這裡貼入 all_questions.json 的完整內容 */;
// ... 其他程式碼
</script>
```

---

## 🏗 架構設計：為未來數據庫擴展做準備

### 核心原則

**現在用 localStorage，未來換成 API。UI 層完全不感知數據來源。**

所有數據操作必須通過統一的 `DB` 抽象層，禁止在 UI 代碼裡直接讀寫 `localStorage`。

---

### 數據抽象層（Data Access Layer）

```javascript
// ============================================================
// db.js（內嵌在 HTML 的 <script> 裡）
// 未來只需要把這一層替換成 fetch('/api/...') 即可
// ============================================================

const DB = {
  // ---------- 分類 CRUD ----------
  async getCategories() {
    const raw = localStorage.getItem('categories');
    return raw ? JSON.parse(raw) : QUESTION_DB.categories;
  },

  async createCategory(category) {
    const cats = await this.getCategories();
    const newCat = { ...category, id: `cat_${Date.now()}`, cards: [] };
    cats.push(newCat);
    localStorage.setItem('categories', JSON.stringify(cats));
    return newCat;
  },

  async updateCategory(id, patch) {
    const cats = await this.getCategories();
    const idx = cats.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Category not found');
    cats[idx] = { ...cats[idx], ...patch };
    localStorage.setItem('categories', JSON.stringify(cats));
    return cats[idx];
  },

  async deleteCategory(id) {
    const cats = await this.getCategories();
    const filtered = cats.filter(c => c.id !== id);
    localStorage.setItem('categories', JSON.stringify(filtered));
  },

  // ---------- 卡片 CRUD ----------
  async getCards(categoryId) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    return cat ? cat.cards : [];
  },

  async createCard(categoryId, card) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    if (!cat) throw new Error('Category not found');
    const newCard = {
      ...card,
      id: `card_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      mastery: 0,
      createdAt: new Date().toISOString()
    };
    cat.cards.push(newCard);
    localStorage.setItem('categories', JSON.stringify(cats));
    return newCard;
  },

  async updateCard(categoryId, cardId, patch) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    if (!cat) throw new Error('Category not found');
    const idx = cat.cards.findIndex(c => c.id === cardId);
    if (idx === -1) throw new Error('Card not found');
    cat.cards[idx] = { ...cat.cards[idx], ...patch };
    localStorage.setItem('categories', JSON.stringify(cats));
    return cat.cards[idx];
  },

  async deleteCard(categoryId, cardId) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    if (!cat) throw new Error('Category not found');
    cat.cards = cat.cards.filter(c => c.id !== cardId);
    localStorage.setItem('categories', JSON.stringify(cats));
  },

  // ---------- 批量操作 ----------
  async bulkCreateCards(categoryId, cards) {
    // cards: [{ q, a, cn?, tag? }, ...]
    const results = [];
    for (const card of cards) {
      results.push(await this.createCard(categoryId, card));
    }
    return results;
  },

  async bulkDeleteCards(categoryId, cardIds) {
    const cats = await this.getCategories();
    const cat = cats.find(c => c.id === categoryId);
    if (!cat) throw new Error('Category not found');
    cat.cards = cat.cards.filter(c => !cardIds.includes(c.id));
    localStorage.setItem('categories', JSON.stringify(cats));
  },

  async bulkUpdateCards(categoryId, updates) {
    // updates: [{ id, ...patch }, ...]
    for (const update of updates) {
      const { id, ...patch } = update;
      await this.updateCard(categoryId, id, patch);
    }
  },

  // ---------- 掌握度（單獨存，高頻讀寫）----------
  async getMastery() {
    const raw = localStorage.getItem('mastery');
    return raw ? JSON.parse(raw) : {};
  },

  async setMastery(cardId, value) {
    const mastery = await this.getMastery();
    mastery[cardId] = value;
    localStorage.setItem('mastery', JSON.stringify(mastery));
  },
};
```

---

### UI 層調用方式（示例）

```javascript
// ✅ 正確：通過 DB 層
const categories = await DB.getCategories();
await DB.updateCard('jp_basic', 'jp1_0', { a: '新しい答え' });
await DB.setMastery('jp1_0', 3);

// ❌ 禁止：直接操作 localStorage
localStorage.setItem('xxx', ...); // 不允許出現在 UI 代碼裡
```

---

### 未來切換到真實 API（只改 DB 層）

```javascript
// 未來只需要把 DB 裡的方法改成這樣：
async getCategories() {
  const res = await fetch('/api/categories', {
    headers: { 'Authorization': `Bearer ${getToken()}` }
  });
  return res.json();
},

async createCard(categoryId, card) {
  const res = await fetch(`/api/categories/${categoryId}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card)
  });
  return res.json();
},
// UI 層代碼完全不需要改
```

---

### 管理頁面（題庫管理）

在首頁右上角加入「⚙️ 管理」入口，提供完整的增刪改查界面：

```
┌─────────────────────────────┐
│  ⚙️ 題庫管理                │
│                             │
│  分類管理:                  │
│  [+ 新增分類]               │
│                             │
│  💻 React技術問題  [✏️][🗑️] │
│  🇯🇵 基本面接問題  [✏️][🗑️] │
│                             │
│  ─────────────────────────  │
│  卡片管理:                  │
│  選擇分類: [React ▼]        │
│                             │
│  [+ 手動新增一題]           │
│  [📥 批量導入（Q:/A:格式）] │
│  [🤖 AI批量導入]            │
│                             │
│  搜尋: [__________]         │
│                             │
│  useEffect vs useLayout...  │
│    ✏️答案  🗑️刪除           │
│  useCallback 和 useMemo...  │
│    ✏️答案  🗑️刪除           │
└─────────────────────────────┘
```

---

### AI 批量操作接口規範

AI（Codex/Claude）批量操作題庫時，輸出標準 JSON，App 解析後調用 `DB` 層執行：

```javascript
// AI 輸出的標準格式
{
  "action": "bulkCreate",          // bulkCreate | bulkUpdate | bulkDelete
  "categoryId": "react_frontend",
  "cards": [                        // bulkCreate / bulkUpdate 用
    {
      "q": "問題文字",
      "a": "答案文字",
      "tag": "Hooks",
      "cn": ""
    }
  ],
  "cardIds": ["card_xxx", "card_yyy"]  // bulkDelete 用
}

// App 執行
async function executeAIBatch(payload) {
  const { action, categoryId, cards, cardIds } = payload;
  if (action === 'bulkCreate') return await DB.bulkCreateCards(categoryId, cards);
  if (action === 'bulkUpdate') return await DB.bulkUpdateCards(categoryId, cards);
  if (action === 'bulkDelete') return await DB.bulkDeleteCards(categoryId, cardIds);
}
```

在管理頁面提供「🤖 AI批量導入」按鈕，用戶貼入上述 JSON 格式即可執行。

---

## 🚀 開發指令

請根據以上 PRD 開發一個完整的單一 HTML 檔案面試刷題應用。

要求：
1. 所有程式碼在一個 `.html` 檔案內
2. 無外部 JS 依賴（CSS 字體 CDN 可以用）
3. 響應式設計，手機優先
4. 題庫 JSON 直接從 `all_questions.json` 複製內嵌進去
5. localStorage 持久化掌握度和編輯內容
6. 實現上述所有 MVP 功能
