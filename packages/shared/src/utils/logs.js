const createEntry = (type, now, actor, message) => ({
  type,
  at: now,
  text: `${actor}: ${message}`
});

export const buildPlanLogs = ({
  baseLogs = [],
  changeMessages = [],
  now,
  actorLabel,
  summaryText = '',
  editType = 'PLAN_EDIT',
  summaryType = 'PLAN_SUMMARY',
  includeSummaryWhenChanged = false
}) => {
  const entries = [...baseLogs];
  changeMessages.forEach((message) => {
    entries.push(createEntry(editType, now, actorLabel, message));
  });
  if (summaryText && (includeSummaryWhenChanged || changeMessages.length === 0)) {
    entries.push({ type: summaryType, at: now, text: `${actorLabel}: ${summaryText}` });
  }
  return entries;
};

export const buildTaskLogs = ({
  baseLogs = [],
  planMessages = [],
  taskMessages = [],
  now,
  actorLabel,
  submitCount = 0,
  planEditType = 'PLAN_EDIT',
  taskEditType = 'TASK_EDIT',
  submitType = 'TASK_SUBMIT'
}) => {
  const entries = [...baseLogs];
  planMessages.forEach((message) => {
    entries.push(createEntry(planEditType, now, actorLabel, message));
  });
  taskMessages.forEach((message) => {
    entries.push(createEntry(taskEditType, now, actorLabel, message));
  });
  entries.push({
    type: submitType,
    at: now,
    text: `${actorLabel}: przesłał ${submitCount || 0} zadań`
  });
  return entries;
};

export const mergeLogs = (planLogs = [], monthlyLogs = []) => {
  const combined = [...monthlyLogs, ...planLogs];
  return combined.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
};
