// ================= UTIL =================

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isJustificationCorrect(userText, validJustifications = []) {
  const normalizedUserText = normalizeText(userText);
  if (!normalizedUserText) return false;

  return validJustifications.some(j => {
    const normalizedExpectedText = normalizeText(j.text || "");
    if (!normalizedExpectedText) return false;

    return (
      normalizedUserText === normalizedExpectedText ||
      normalizedUserText.includes(normalizedExpectedText)
    );
  });
}

function createExpandingTextarea(name, placeholder = "") {
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.placeholder = placeholder;
  textarea.rows = 1;
  textarea.className = "expanding-answer";

  const resize = () => {
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };

  textarea.addEventListener("input", resize);
  requestAnimationFrame(resize);

  return textarea;
}

// ================= STATE =================

let examMode = null;
let examFlow = "specific";
let examsIndex = null;
let selectedYear = null;
let pendingExam = null;
let selectedExam = null;
let randomCriteria = null;
let lastRandomExamId = null;
let practiceReadingCriteria = null;
let practiceUseCriteria = null;
let lastPracticeReadingKey = null;
let lastPracticeUseExamId = null;

let readingsData = [];
let activeReadingId = null;

let useData = null;
let activeUseBlockId = null;
let selectedUseGroups = [];
let currentSectionId = "startSelection";
let restoringHistory = false;

// ================= LOAD =================

async function loadExamsIndex() {
  const res = await fetch("./js/data/exams/index.json");
  if (!res.ok) throw new Error("No se pudo cargar el índice de exámenes");
  return res.json();
}

async function loadFile(path) {
  const res = await fetch(`./js/data/${path}`);
  if (!res.ok) throw new Error(`No se pudo cargar el archivo: ${path}`);
  return res.json();
}

// ================= NAVIGATION =================

function showSection(sectionId, options = {}) {
  const previousSectionId = currentSectionId;

  [
    "startSelection",
    "randomSelection",
    "practiceReadingSelection",
    "practiceUseSelection",
    "yearSelection",
    "examSelection",
    "legacyModelSelection",
    "exam"
  ].forEach(id => {
    document.getElementById(id).style.display = id === sectionId ? "block" : "none";
  });

  currentSectionId = sectionId;

  if (
    !restoringHistory &&
    options.pushHistory !== false &&
    previousSectionId !== sectionId
  ) {
    history.pushState({ sectionId }, "", `#${sectionId}`);
  }
}

function restoreSection(sectionId) {
  restoringHistory = true;
  showSection(sectionId, { pushHistory: false });
  restoringHistory = false;
}

function navigateBack(fallbackSectionId) {
  if (history.state?.sectionId && history.length > 1) {
    history.back();
    return;
  }

  showSection(fallbackSectionId);
}

history.replaceState({ sectionId: "startSelection" }, "", "#startSelection");

window.addEventListener("popstate", event => {
  restoreSection(event.state?.sectionId || "startSelection");
});

function isOldLegacyUseMode() {
  return examMode === "legacy_old" && selectedExam?.year !== 2025;
}

document.getElementById("chooseSpecificExam").onclick = () => {
  examFlow = "specific";
  initYearSelection();
};

document.getElementById("chooseRandomExam").onclick = () => {
  examFlow = "random";
  initRandomSelection();
};

document.getElementById("choosePracticeReading").onclick = () => {
  examFlow = "practice_reading";
  initPracticeSelection("reading");
};

document.getElementById("choosePracticeUse").onclick = () => {
  examFlow = "practice_use";
  initPracticeSelection("use");
};

document.getElementById("chooseLegacyOld").onclick = () => {
  if (!pendingExam) return;
  examFlow = "specific";
  examMode = "legacy_old";
  startExam(pendingExam);
};

document.getElementById("chooseLegacyNew").onclick = () => {
  if (!pendingExam) return;
  examFlow = "specific";
  examMode = "legacy_new";
  startExam(pendingExam);
};

document.getElementById("backFromYear").onclick = () => {
  navigateBack("startSelection");
};

document.getElementById("backFromRandomSelection").onclick = () => {
  navigateBack("startSelection");
};

document.getElementById("backFromPracticeReadingSelection").onclick = () => {
  navigateBack("startSelection");
};

document.getElementById("backFromPracticeUseSelection").onclick = () => {
  navigateBack("startSelection");
};

document.getElementById("backFromExamSelection").onclick = () => {
  navigateBack("yearSelection");
};

document.getElementById("backFromLegacyModel").onclick = () => {
  navigateBack("examSelection");
};

document.getElementById("backFromExam").onclick = () => {
  const fallbackSectionId =
    examFlow === "practice_reading"
      ? "practiceReadingSelection"
      : examFlow === "practice_use"
        ? "practiceUseSelection"
        : examFlow === "random"
          ? "randomSelection"
          : selectedExam?.year === 2025
            ? "examSelection"
            : "legacyModelSelection";

  navigateBack(fallbackSectionId);
};

document.getElementById("startRandomExam").onclick = () => {
  startRandomExamFromSelection();
};

document.getElementById("skipRandomExam").onclick = () => {
  startNextRandomExam();
};

document.getElementById("startPracticeReading").onclick = () => {
  startPracticeReadingFromSelection();
};

document.getElementById("skipPracticeReading").onclick = () => {
  startNextPracticeReading();
};

document.getElementById("startPracticeUse").onclick = () => {
  startPracticeUseFromSelection();
};

document.getElementById("skipPracticeUse").onclick = () => {
  startNextPracticeUse();
};

document.querySelectorAll('input[name="randomModel"]').forEach(input => {
  input.addEventListener("change", () => {
    if (input.value !== "legacy_old" || !input.checked) return;

    const year2025 = document.querySelector('input[name="randomYear"][value="2025"]');
    if (!year2025?.checked) return;

    alert("2025 no está disponible con modelo antiguo.");
    document.querySelector('input[name="randomModel"][value="legacy_new"]').checked = true;
  });
});

// ================= EXAM SELECTION =================

async function initYearSelection() {
  try {
    examsIndex = examsIndex || (await loadExamsIndex());

    const years = [...new Set(examsIndex.exams.map(exam => exam.year))]
      .sort((a, b) => b - a);

    const list = document.getElementById("yearList");
    list.innerHTML = "";

    years.forEach(year => {
      const btn = document.createElement("button");
      btn.textContent = year;
      btn.onclick = () => selectYear(year);
      list.appendChild(btn);
    });

    showSection("yearSelection");
  } catch (error) {
    alert(error.message);
  }
}

function selectYear(year) {
  selectedYear = year;
  pendingExam = null;

  const list = document.getElementById("examList");
  list.innerHTML = "";

  examsIndex.exams
    .filter(exam => exam.year === year)
    .forEach(exam => {
      const btn = document.createElement("button");
      btn.textContent = exam.label;
      btn.onclick = () => selectExam(exam);
      list.appendChild(btn);
    });

  showSection("examSelection");
}

function selectExam(exam) {
  pendingExam = exam;
  examFlow = "specific";

  if (exam.year === 2025) {
    examMode = "current";
    startExam(exam);
    return;
  }

  showSection("legacyModelSelection");
}

async function initRandomSelection() {
  try {
    examsIndex = examsIndex || (await loadExamsIndex());

    const years = [...new Set(examsIndex.exams.map(exam => exam.year))]
      .sort((a, b) => b - a);

    const list = document.getElementById("randomYearList");
    list.innerHTML = "";

    renderYearChecklist(list, "randomYear", years, {
      withLegacyNote: true,
      onChange: (year, checkbox) => {
        const oldModel = document.querySelector(
          'input[name="randomModel"][value="legacy_old"]'
        );

        if (year === 2025 && checkbox.checked && oldModel?.checked) {
          alert("2025 no está disponible con modelo antiguo.");
          checkbox.checked = false;
        }
      }
    });

    showSection("randomSelection");
  } catch (error) {
    alert(error.message);
  }
}

async function initPracticeSelection(kind) {
  try {
    examsIndex = examsIndex || (await loadExamsIndex());

    const years = [...new Set(examsIndex.exams.map(exam => exam.year))]
      .sort((a, b) => b - a);
    const listId = kind === "reading" ? "practiceReadingYearList" : "practiceUseYearList";
    const sectionId = kind === "reading" ? "practiceReadingSelection" : "practiceUseSelection";
    const inputName = kind === "reading" ? "practiceReadingYear" : "practiceUseYear";
    const list = document.getElementById(listId);
    list.innerHTML = "";

    renderYearChecklist(list, inputName, years);
    showSection(sectionId);
  } catch (error) {
    alert(error.message);
  }
}

function renderYearChecklist(list, inputName, years, options = {}) {
  years.forEach(year => {
    const label = document.createElement("label");
    label.className = "random-year-choice";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = inputName;
    checkbox.value = year;
    checkbox.checked = true;

    if (options.onChange) {
      checkbox.addEventListener("change", () => options.onChange(year, checkbox));
    }

    label.appendChild(checkbox);
    label.append(` ${year}`);

    if (options.withLegacyNote && year === 2025) {
      const note = document.createElement("span");
      note.className = "unavailable-note";
      note.textContent = " no disponible con modelo antiguo";
      label.appendChild(note);
    }

    list.appendChild(label);
    list.appendChild(document.createElement("br"));
  });
}

function getRandomSelectionCriteria() {
  const years = [...document.querySelectorAll('input[name="randomYear"]:checked')]
    .map(input => Number(input.value));
  const model = document.querySelector('input[name="randomModel"]:checked')?.value;

  if (!years.length) {
    alert("Elige al menos un año.");
    return null;
  }

  if (!model) {
    alert("Elige un modelo de examen.");
    return null;
  }

  if (model === "legacy_old" && years.includes(2025)) {
    alert("2025 no está disponible con modelo antiguo. Quita 2025 o elige modelo nuevo.");
    return null;
  }

  return { years, model };
}

function getPracticeCriteria(inputName) {
  const years = [...document.querySelectorAll(`input[name="${inputName}"]:checked`)]
    .map(input => Number(input.value));

  if (!years.length) {
    alert("Elige al menos un año.");
    return null;
  }

  return { years };
}

function pickRandomExam(candidates) {
  if (candidates.length === 1) return candidates[0];

  const differentCandidates = candidates.filter(exam => exam.id !== lastRandomExamId);
  const pool = differentCandidates.length ? differentCandidates : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startRandomExamFromSelection() {
  examFlow = "random";
  const criteria = getRandomSelectionCriteria();
  if (!criteria) return;

  randomCriteria = criteria;
  startRandomExam(randomCriteria);
}

function startNextRandomExam() {
  if (!randomCriteria) {
    startRandomExamFromSelection();
    return;
  }

  startRandomExam(randomCriteria);
}

function startRandomExam(criteria) {
  examFlow = "random";
  const candidates = examsIndex.exams.filter(exam =>
    criteria.years.includes(exam.year)
  );

  if (!candidates.length) {
    alert("No hay exámenes disponibles con esos criterios.");
    return;
  }

  const exam = pickRandomExam(candidates);
  lastRandomExamId = exam.id;

  if (criteria.model === "legacy_old") {
    examMode = "legacy_old";
  } else {
    examMode = exam.year === 2025 ? "current" : "legacy_new";
  }

  startExam(exam);
}

function getPracticeReadingCandidates(criteria) {
  return examsIndex.exams
    .filter(exam => criteria.years.includes(exam.year))
    .flatMap(exam =>
      exam.reading.map(reading => ({
        exam,
        reading,
        key: `${exam.id}:${reading.id}`
      }))
    );
}

function pickPracticeReading(candidates) {
  if (candidates.length === 1) return candidates[0];

  const differentCandidates = candidates.filter(item => item.key !== lastPracticeReadingKey);
  const pool = differentCandidates.length ? differentCandidates : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startPracticeReadingFromSelection() {
  examFlow = "practice_reading";
  const criteria = getPracticeCriteria("practiceReadingYear");
  if (!criteria) return;

  practiceReadingCriteria = criteria;
  startPracticeReading(practiceReadingCriteria);
}

function startNextPracticeReading() {
  if (!practiceReadingCriteria) {
    startPracticeReadingFromSelection();
    return;
  }

  startPracticeReading(practiceReadingCriteria);
}

async function startPracticeReading(criteria) {
  try {
    examFlow = "practice_reading";
    examsIndex = examsIndex || (await loadExamsIndex());

    const candidates = getPracticeReadingCandidates(criteria);
    if (!candidates.length) {
      alert("No hay readings disponibles con esos criterios.");
      return;
    }

    const chosen = pickPracticeReading(candidates);
    lastPracticeReadingKey = chosen.key;
    selectedExam = chosen.exam;
    examMode = "practice_reading";
    readingsData = [await loadFile(chosen.reading.file)];
    activeReadingId = readingsData[0].id;
    useData = null;
    activeUseBlockId = null;
    selectedUseGroups = [];

    document.getElementById("finalScore").innerHTML = "";
    showSection("exam");
    configureExamSections("reading");
    document.getElementById("examTitle").textContent =
      `Reading aleatorio – ${chosen.exam.label}`;
    document.getElementById("readingChoice").style.display = "none";
    document.getElementById("useQuestions").innerHTML = "";
    renderSingleReading(activeReadingId);
    document.getElementById("submitExam").onclick = correctExam;
  } catch (error) {
    alert(error.message);
    showSection("practiceReadingSelection");
  }
}

function getPracticeUseCandidates(criteria) {
  return examsIndex.exams.filter(exam => criteria.years.includes(exam.year));
}

function pickPracticeUse(candidates) {
  if (candidates.length === 1) return candidates[0];

  const differentCandidates = candidates.filter(exam => exam.id !== lastPracticeUseExamId);
  const pool = differentCandidates.length ? differentCandidates : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function startPracticeUseFromSelection() {
  examFlow = "practice_use";
  const criteria = getPracticeCriteria("practiceUseYear");
  if (!criteria) return;

  practiceUseCriteria = criteria;
  startPracticeUse(practiceUseCriteria);
}

function startNextPracticeUse() {
  if (!practiceUseCriteria) {
    startPracticeUseFromSelection();
    return;
  }

  startPracticeUse(practiceUseCriteria);
}

async function startPracticeUse(criteria) {
  try {
    examFlow = "practice_use";
    examsIndex = examsIndex || (await loadExamsIndex());

    const candidates = getPracticeUseCandidates(criteria);
    if (!candidates.length) {
      alert("No hay Use of English disponibles con esos criterios.");
      return;
    }

    const exam = pickPracticeUse(candidates);
    lastPracticeUseExamId = exam.id;
    selectedExam = exam;
    examMode = "practice_use";
    readingsData = [];
    activeReadingId = null;
    useData = await loadFile(exam.useOfEnglish.file);
    activeUseBlockId = null;
    selectedUseGroups = [];

    document.getElementById("finalScore").innerHTML = "";
    showSection("exam");
    configureExamSections("use");
    document.getElementById("examTitle").textContent =
      `Use of English aleatorio – ${exam.label}`;
    document.getElementById("readingChoice").style.display = "none";
    document.getElementById("readingContainer").innerHTML = "";
    setupUseOfEnglishPracticeAll();
    document.getElementById("submitExam").onclick = correctExam;
  } catch (error) {
    alert(error.message);
    showSection("practiceUseSelection");
  }
}

function configureExamSections(visiblePart = "full") {
  document.getElementById("readingSection").style.display =
    visiblePart === "use" ? "none" : "block";
  document.getElementById("useSection").style.display =
    visiblePart === "reading" ? "none" : "block";
  document.getElementById("examSeparator").style.display =
    visiblePart === "full" ? "block" : "none";
  document.getElementById("skipRandomExam").style.display =
    examFlow === "random" ? "inline-block" : "none";
  document.getElementById("skipPracticeReading").style.display =
    examFlow === "practice_reading" ? "inline-block" : "none";
  document.getElementById("skipPracticeUse").style.display =
    examFlow === "practice_use" ? "inline-block" : "none";
}

async function startExam(exam) {
  try {
    selectedExam = exam;
    document.getElementById("finalScore").innerHTML = "";

    showSection("exam");
    configureExamSections("full");
    document.getElementById("examTitle").textContent = exam.label;

    readingsData = [];
    for (const r of exam.reading) {
      readingsData.push(await loadFile(r.file));
    }

    useData = await loadFile(exam.useOfEnglish.file);

    setupReadings();
    setupUseOfEnglish();

    document.getElementById("submitExam").onclick = correctExam;
  } catch (error) {
    alert(error.message);
    showSection(examFlow === "random" ? "randomSelection" : selectedYear ? "examSelection" : "startSelection");
  }
}

// ================= READINGS =================

function setupReadings() {
  const container = document.getElementById("readingContainer");
  container.innerHTML = "";

  if (examMode === "legacy_old" && readingsData.length > 1) {
    document.getElementById("readingChoice").style.display = "block";
    const select = document.getElementById("chosenReading");
    select.innerHTML = "";

    readingsData.forEach(r => {
      const opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.title;
      select.appendChild(opt);
    });

    activeReadingId = readingsData[0].id;
    renderSingleReading(activeReadingId);

    select.onchange = () => {
      activeReadingId = select.value;
      renderSingleReading(activeReadingId);
    };
  } else {
    document.getElementById("readingChoice").style.display = "none";
    const chosen = readingsData[0];

    activeReadingId = chosen.id;
    renderSingleReading(activeReadingId);
  }
}

function renderSingleReading(readingId) {
  const container = document.getElementById("readingContainer");
  container.innerHTML = "";

  const reading = readingsData.find(r => r.id === readingId);
  if (!reading) return;

  const block = document.createElement("div");
  block.className = "reading-block";

  const title = document.createElement("h4");
  title.textContent = reading.title;
  block.appendChild(title);

  const text = document.createElement("p");
  text.className = "reading-text";
  text.textContent = reading.text;
  block.appendChild(text);

  reading.questions.forEach(q => {
    const div = document.createElement("div");
    div.className = "question";
    div.dataset.id = q.id;

    div.innerHTML = `<p><strong>${q.id}</strong>. ${q.prompt}</p>`;

    if (q.type === "mcq") {
      Object.entries(q.options).forEach(([k, v]) => {
        div.innerHTML += `
          <label>
            <input type="radio" name="${q.id}" value="${k}"> (${k}) ${v}
          </label><br>`;
      });
    }

    if (q.type === "tf") {
      ["true", "false"].forEach(v => {
        div.innerHTML += `
          <label>
            <input type="radio" name="${q.id}" value="${v}"> ${v.toUpperCase()}
          </label><br>`;
      });
      div.appendChild(
        createExpandingTextarea(
          `${q.id}_justification`,
          "Copia la frase que justifica tu respuesta"
        )
      );
    }

    if (q.type === "word") {
      div.innerHTML += `<input type="text" name="${q.id}">`;
    }

    block.appendChild(div);
  });

  container.appendChild(block);
}

// ================= USE OF ENGLISH =================

function setupUseOfEnglish() {
  const container = document.getElementById("useQuestions");
  container.innerHTML = "";
  selectedUseGroups = [];

  const select = document.getElementById("chosenUseBlock");
  select.innerHTML = "";

  if (isOldLegacyUseMode() || useData.blockRules?.chooseAny) {
    document.getElementById("useBlockChoice").style.display = "none";
    activeUseBlockId = null;

    const blockDiv = document.createElement("div");
    blockDiv.dataset.block = "all";

    appendUseQuestions(blockDiv, useData.questions);

    container.appendChild(blockDiv);
    return;
  }

  document.getElementById("useBlockChoice").style.display = "block";

  useData.blocks.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = b.label;
    select.appendChild(opt);
  });

  activeUseBlockId = useData.blocks[0].id;

  select.onchange = () => {
    activeUseBlockId = select.value;
    updateUseBlockVisibility();
  };

  useData.blocks.forEach(block => {
    const blockDiv = document.createElement("div");
    blockDiv.dataset.block = block.id;
    blockDiv.innerHTML = `<h4>${block.label}</h4>`;

    const questions = useData.questions.filter(q =>
      block.questionIds.includes(q.id)
    );

    appendUseQuestions(blockDiv, questions);

    container.appendChild(blockDiv);
  });

  updateUseBlockVisibility();
}

function setupUseOfEnglishPracticeAll() {
  const container = document.getElementById("useQuestions");
  container.innerHTML = "";
  selectedUseGroups = [];

  document.getElementById("useBlockChoice").style.display = "none";
  activeUseBlockId = null;

  const blockDiv = document.createElement("div");
  blockDiv.dataset.block = "all";
  appendUseQuestions(blockDiv, useData.questions);
  container.appendChild(blockDiv);
}

function appendUseQuestions(parent, questions) {
  const renderedGroups = new Set();

  questions.forEach(q => {
    if (q.groupId && !renderedGroups.has(q.groupId)) {
      renderedGroups.add(q.groupId);
      parent.appendChild(renderUseGroupTitle(q.groupId));
    }

    parent.appendChild(renderUseQuestion(q));
  });
}

function renderUseGroupTitle(groupId) {
  const groupTitle = document.createElement("div");
  groupTitle.className = "use-group-title";

  if (isOldLegacyUseMode()) {
    groupTitle.appendChild(createUseDeliveryCheckbox(groupId));
    return groupTitle;
  }

  groupTitle.textContent = groupId;
  return groupTitle;
}

function renderUseQuestion(q) {
  const div = document.createElement("div");
  div.className = q.groupId ? "question use-subquestion" : "question";
  div.dataset.id = q.id;

  const prompt = document.createElement("p");
  if (isOldLegacyUseMode() && !q.groupId) {
    prompt.appendChild(createUseDeliveryCheckbox(q.id, "Entregar"));
    prompt.append(" ");
  }

  const strong = document.createElement("strong");
  strong.textContent = q.id;
  prompt.appendChild(strong);
  prompt.append(`. ${q.prompt} ${q.instruction || ""}`);
  div.appendChild(prompt);

  if (q.type === "mcq") {
    Object.entries(q.options).forEach(([k, v]) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "radio";
      input.name = q.id;
      input.value = k;

      label.appendChild(input);
      label.append(` (${k}) ${v}`);
      div.appendChild(label);
      div.appendChild(document.createElement("br"));
    });
  } else {
    div.appendChild(createExpandingTextarea(q.id, "Escribe tu respuesta"));
  }

  return div;
}

function createUseDeliveryCheckbox(groupId, labelText = `Entregar ${groupId}`) {
  const label = document.createElement("label");
  label.className = "use-delivery-choice";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.useGroup = groupId;
  checkbox.addEventListener("change", () => updateUseDeliverySelection(checkbox));

  label.appendChild(checkbox);
  label.append(` ${labelText}`);
  return label;
}

function updateUseDeliverySelection(checkbox) {
  const groupId = checkbox.dataset.useGroup;

  if (checkbox.checked) {
    selectedUseGroups = selectedUseGroups.filter(id => id !== groupId);
    selectedUseGroups.push(groupId);

    if (selectedUseGroups.length > 6) {
      const removedGroupId = selectedUseGroups.shift();
      const removedCheckbox = document.querySelector(
        `input[data-use-group="${removedGroupId}"]`
      );
      if (removedCheckbox) removedCheckbox.checked = false;
    }
  } else {
    selectedUseGroups = selectedUseGroups.filter(id => id !== groupId);
  }

  updateUseDeliveryCounter();
}

function updateUseDeliveryCounter() {
  const existing = document.getElementById("useDeliveryCounter");
  if (existing) existing.remove();

  if (!isOldLegacyUseMode()) return;

  const counter = document.createElement("p");
  counter.id = "useDeliveryCounter";
  counter.className = "use-delivery-counter";
  counter.textContent = `Preguntas elegidas para entregar: ${selectedUseGroups.length} / 6`;

  document.getElementById("useQuestions").prepend(counter);
}

function updateUseBlockVisibility() {
  document.querySelectorAll("#useQuestions [data-block]").forEach(b => {
    const disabled = b.dataset.block !== activeUseBlockId;
    b.querySelectorAll("input, textarea").forEach(i => (i.disabled = disabled));
    b.style.opacity = disabled ? 0.4 : 1;
  });
}

// ================= CORRECTION =================

function clearFeedback() {
  document.querySelectorAll(".feedback").forEach(f => f.remove());
}

function addFeedback(div, html, ok) {
  if (!div) return; // evita que se rompa si algo no existe
  const f = document.createElement("div");
  f.className = "feedback";
  f.innerHTML = html;
  f.style.color = ok ? "green" : "red";
  div.appendChild(f);
}

function correctExam() {
  clearFeedback();

  if (examFlow === "practice_reading") {
    const readingScore = correctReading();
    renderPracticeReadingScore(readingScore);
    return;
  }

  if (examFlow === "practice_use") {
    const useResult = correctUsePracticeAll();
    renderPracticeUseScore(useResult);
    return;
  }

  const readingScore = correctReading();
  const useScore = correctUse();
  if (useScore === null) return;

  renderFinalScore(readingScore, useScore);
}

// ---------- READING ----------

function correctReading() {
  let score = 0;
  const reading = readingsData.find(r => r.id === activeReadingId);
  if (!reading) return 0;

  reading.questions.forEach(q => {
    const div = document.querySelector(
      `#readingContainer .question[data-id="${q.id}"]`
    );
    let correct = false;
    let selectedTfAnswerCorrect = false;
    let justificationCorrect = false;

    if (q.type === "mcq") {
      const c = div.querySelector(`input[name="${q.id}"]:checked`);
      if (c) correct = q.answer.includes(c.value);
    }

    if (q.type === "word") {
      const i = div.querySelector(`input[name="${q.id}"]`);
      if (i) {
        correct = (q.answer || []).some(
          answer => normalizeText(answer) === normalizeText(i.value)
        );
      }
    }

    if (q.type === "tf") {
      const c = div.querySelector(`input[name="${q.id}"]:checked`);
      const justification = div.querySelector(
        `[name="${q.id}_justification"]`
      );

      selectedTfAnswerCorrect = Boolean(c) && q.answer[0] === (c.value === "true");
      justificationCorrect = isJustificationCorrect(
        justification?.value || "",
        q.justification || []
      );
      correct = selectedTfAnswerCorrect && justificationCorrect;
    }

    if (correct) {
      score += q.points;
      addFeedback(div, "✅ Correcto", true);
    } else {
      let html = "❌ Incorrecto<br>";
      if (q.type === "tf") {
        if (selectedTfAnswerCorrect && !justificationCorrect) {
          html += "La respuesta TRUE/FALSE es correcta, pero falta una justificación válida.<br>";
        }
        html += `<strong>Respuesta correcta:</strong> ${q.answer[0]
          .toString()
          .toUpperCase()}<ul>`;
        (q.justification || []).forEach(j => {
          html += `<li>${j.text} (líneas ${j.lines.join("-")})</li>`;
        });
        html += "</ul>";
      } else {
        html += `<strong>Respuesta correcta:</strong> ${(q.answer || []).join(", ")}`;
      }
      addFeedback(div, html, false);
    }
  });

  return score;
}

// ---------- USE ----------

function correctUse() {
  if (isOldLegacyUseMode() || useData.blockRules?.chooseAny) {
    return correctUseChooseAny();
  }

  let score = 0;
  const block = useData.blocks.find(b => b.id === activeUseBlockId);
  if (!block) return 0;

  block.questionIds.forEach(qId => {
    const q = useData.questions.find(x => x.id === qId);
    if (!q) return;

    const div = document.querySelector(
      `#useQuestions [data-block="${block.id}"] .question[data-id="${q.id}"]`
    );

    let correct = false;

    if (q.type === "mcq") {
      const c = div.querySelector(`input[name="${q.id}"]:checked`);
      if (c) correct = (q.answer || []).includes(c.value);
    } else {
      const i = div.querySelector(`[name="${q.id}"]`);
      if (i) {
        const validAnswers = Array.isArray(q.answers) ? q.answers : [];
        correct = validAnswers.some(
          a => normalizeText(a) === normalizeText(i.value)
        );
      }
    }

    if (correct) {
      score += q.points;
      addFeedback(div, "✅ Correcto", true);
    } else {
      // ✅ AQUÍ ESTÁ LA CORRECCIÓN IMPORTANTE: MCQ usa q.answer, no q.answers
      let html = "❌ Incorrecto<br>";

      if (q.type === "mcq") {
        const letters = Array.isArray(q.answer) ? q.answer : [];
        const pretty = letters
          .map(k => {
            const text = q.options?.[k];
            return text ? `(${k}) ${text}` : `(${k})`;
          })
          .join("<br>");

        html += `<strong>Respuesta correcta:</strong><br>${pretty || "(sin respuesta definida)"}`;
      } else {
        const validAnswers = Array.isArray(q.answers) ? q.answers : [];
        html += `<strong>Respuestas correctas:</strong><br>${validAnswers.length ? validAnswers.join("<br>") : "(sin respuesta definida)"
          }`;
      }

      addFeedback(div, html, false);
    }
  });

  return score;
}

function correctUseChooseAny() {
  if (isOldLegacyUseMode() && selectedUseGroups.length !== 6) {
    alert("Debes elegir exactamente 6 preguntas de Use of English para entregar.");
    return null;
  }

  let score = 0;

  useData.questions.forEach(q => {
    const div = document.querySelector(
      `#useQuestions [data-block="all"] .question[data-id="${q.id}"]`
    );
    if (!div) return;

    const groupId = q.groupId || q.id.split(".")[0];

    if (isOldLegacyUseMode() && !selectedUseGroups.includes(groupId)) {
      return;
    }

    if (!isOldLegacyUseMode() && !isUseQuestionAnswered(div, q)) return;

    const correct = isUseAnswerCorrect(div, q);
    if (correct) {
      score += q.points;
      addFeedback(div, "✅ Correcto", true);
    } else {
      addUseIncorrectFeedback(div, q);
    }
  });

  return score;
}

function correctUsePracticeAll() {
  const groupResults = new Map();

  useData.questions.forEach(q => {
    const div = document.querySelector(
      `#useQuestions [data-block="all"] .question[data-id="${q.id}"]`
    );
    if (!div) return;

    const groupId = q.groupId || q.id.split(".")[0];
    const correct = isUseAnswerCorrect(div, q);
    if (!groupResults.has(groupId)) {
      groupResults.set(groupId, []);
    }
    groupResults.get(groupId).push(correct);

    if (correct) {
      addFeedback(div, "✅ Correcto", true);
    } else {
      addUseIncorrectFeedback(div, q);
    }
  });

  let correctGroups = 0;
  groupResults.forEach(results => {
    if (results.every(Boolean)) correctGroups += 1;
  });

  return {
    correct: correctGroups,
    total: groupResults.size
  };
}

function isUseQuestionAnswered(div, q) {
  if (q.type === "mcq") {
    return Boolean(div.querySelector(`input[name="${q.id}"]:checked`));
  }

  const i = div.querySelector(`[name="${q.id}"]`);
  return Boolean(i?.value.trim());
}

function isUseAnswerCorrect(div, q) {
  if (q.type === "mcq") {
    const c = div.querySelector(`input[name="${q.id}"]:checked`);
    return Boolean(c) && (q.answer || []).includes(c.value);
  }

  const i = div.querySelector(`[name="${q.id}"]`);
  if (!i) return false;

  const validAnswers = Array.isArray(q.answers) ? q.answers : [];
  return validAnswers.some(a => normalizeText(a) === normalizeText(i.value));
}

function addUseIncorrectFeedback(div, q) {
  let html = "❌ Incorrecto<br>";

  if (q.type === "mcq") {
    const letters = Array.isArray(q.answer) ? q.answer : [];
    const pretty = letters
      .map(k => {
        const text = q.options?.[k];
        return text ? `(${k}) ${text}` : `(${k})`;
      })
      .join("<br>");

    html += `<strong>Respuesta correcta:</strong><br>${pretty || "(sin respuesta definida)"}`;
  } else {
    const validAnswers = Array.isArray(q.answers) ? q.answers : [];
    html += `<strong>Respuestas correctas:</strong><br>${validAnswers.length ? validAnswers.join("<br>") : "(sin respuesta definida)"
      }`;
  }

  addFeedback(div, html, false);
}

// ================= FINAL SCORE =================

function renderFinalScore(readingScore, useScore) {
  const div = document.getElementById("finalScore");

  div.innerHTML = `
    <h3>Resultados</h3>
    <p><strong>Reading:</strong> ${readingScore} / 4</p>
    <p><strong>Use of English:</strong> ${useScore} / 3</p>
    <p><strong>Nota final:</strong> ${(readingScore + useScore).toFixed(2)} / 7</p>
  `;
}

function renderPracticeReadingScore(readingScore) {
  const div = document.getElementById("finalScore");

  div.innerHTML = `
    <h3>Resultados</h3>
    <p><strong>Reading:</strong> ${readingScore} / 4</p>
  `;
}

function renderPracticeUseScore(useResult) {
  const div = document.getElementById("finalScore");

  div.innerHTML = `
    <h3>Resultados</h3>
    <p><strong>Use of English:</strong> ${useResult.correct} respuestas correctas / ${useResult.total}</p>
  `;
}
