const STORAGE_KEY = "teacherData";

function getInitialTeacherData() {
  return {
    level: 1,
    answersCount: 0,
    correctAnswers: 0,
    totalCorrectAnswers: 0,
    usedQuestionIds: [],
    currentQuestionId: null,
    xp: 0,
    coins: 0,
    textAnswers: [],
    pendingReward: null
  };
}

function calculateProfileLevel(xp) {
  let level = 1;
  let xpRemaining = xp;

  while (true) {
    const xpRequired = 50 + (level - 1) * 25;

    if (xpRemaining >= xpRequired) {
      xpRemaining -= xpRequired;
      level++;
    } else {
      break;
    }
  }

  return level;
}

function calculateProgressData(xp) {
  let level = 1;
  let xpRemaining = xp;

  while (true) {
    const xpRequired = 50 + (level - 1) * 25;

    if (xpRemaining >= xpRequired) {
      xpRemaining -= xpRequired;
      level++;
    } else {
      return {
        level,
        xpIntoLevel: xpRemaining,
        xpRequired
      };
    }
  }
}

function getTeacherData() {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    const initial = getInitialTeacherData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }

  try {
    const parsed = JSON.parse(raw);
    const initial = getInitialTeacherData();
    return { ...initial, ...parsed };
  } catch {
    const initial = getInitialTeacherData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
}

function updateTeacherData(updater) {
  const current = getTeacherData();
  const updated = updater(current);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export {
  getTeacherData,
  updateTeacherData,
  calculateProfileLevel,
  calculateProgressData
};