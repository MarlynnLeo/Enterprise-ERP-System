const BusinessError = require('../../utils/BusinessError');

const isReleased = (inspection) =>
  ['passed', 'conditional'].includes(inspection.first_article_result) &&
  ['passed', 'partial', 'completed'].includes(inspection.status) &&
  Number(inspection.production_can_continue) === 1 &&
  Number(inspection.inspector_id) > 0 &&
  Boolean(inspection.actual_date) &&
  (inspection.first_article_result !== 'conditional' ||
    Boolean(String(inspection.note || '').trim()));

async function releasedThroughRework(connection, inspections) {
  const releasedIds = new Set(inspections.filter(isReleased).map((row) => Number(row.id)));
  const heldInspections = inspections.filter(
    (row) =>
      !isReleased(row) &&
      (['failed', 'partial'].includes(row.status) ||
        ['failed', 'conditional'].includes(row.first_article_result))
  );
  if (!releasedIds.size || !heldInspections.length) return releasedIds;

  // Rework completion creates a new inspection and records this exact link.
  // Do not lock rework rows after the task/inspection locks: its completion path
  // locks the rework first. A not-yet-committed completion conservatively stays held.
  const [rows] = await connection.query(
    `SELECT ncp.id AS ncp_id, ncp.inspection_id AS source_inspection_id,
            ncp.quantity AS ncp_quantity, ncp.status AS ncp_status,
            rt.id AS rework_id, rt.status AS rework_status, rt.quantity AS rework_quantity,
            dl.target_id AS reinspection_id
       FROM nonconforming_products ncp
       LEFT JOIN rework_tasks rt ON rt.ncp_id = ncp.id AND rt.status <> 'cancelled'
       LEFT JOIN document_links dl ON dl.source_type = 'rework_task' AND dl.source_id = rt.id
         AND dl.target_type = 'quality_inspection'
      WHERE ncp.inspection_id IN (?) AND ncp.deleted_at IS NULL
      ORDER BY ncp.id, rt.id, dl.target_id`,
    [heldInspections.map((row) => row.id)]
  );
  const byId = new Map(inspections.map((row) => [Number(row.id), row]));
  const sources = new Map();
  const targetOwners = new Map();
  for (const row of rows) {
    const sourceId = Number(row.source_inspection_id);
    if (!sources.has(sourceId)) sources.set(sourceId, new Map());
    const ncps = sources.get(sourceId);
    if (!ncps.has(Number(row.ncp_id))) {
      ncps.set(Number(row.ncp_id), {
        quantity: Number(row.ncp_quantity),
        status: row.ncp_status,
        reworks: new Map(),
      });
    }
    const ncp = ncps.get(Number(row.ncp_id));
    if (!row.rework_id) continue;
    if (!ncp.reworks.has(Number(row.rework_id))) {
      ncp.reworks.set(Number(row.rework_id), {
        status: row.rework_status,
        quantity: Number(row.rework_quantity),
        targets: new Set(),
      });
    }
    if (row.reinspection_id) {
      const targetId = Number(row.reinspection_id);
      ncp.reworks.get(Number(row.rework_id)).targets.add(targetId);
      if (!targetOwners.has(targetId)) targetOwners.set(targetId, new Set());
      targetOwners.get(targetId).add(Number(row.rework_id));
    }
  }

  const resolve = (id, visiting = new Set()) => {
    if (releasedIds.has(id)) return true;
    if (visiting.has(id) || !byId.has(id) || !sources.has(id)) return false;
    const nextVisiting = new Set([...visiting, id]);
    const ncps = [...sources.get(id).values()];
    const original = byId.get(id);
    const failedQuantity =
      Number(original.unqualified_quantity) ||
      (original.status === 'failed' ? Number(original.quantity) : 0);
    if (
      failedQuantity > 0 &&
      ncps.reduce((sum, ncp) => sum + ncp.quantity, 0) + 0.000001 < failedQuantity
    )
      return false;
    const usedTargets = new Set();
    for (const ncp of ncps) {
      if (
        !Number.isFinite(ncp.quantity) ||
        ncp.quantity <= 0 ||
        ncp.status === 'cancelled' ||
        !ncp.reworks.size
      )
        return false;
      let reworked = 0;
      for (const rework of ncp.reworks.values()) {
        if (
          rework.status !== 'completed' ||
          !Number.isFinite(rework.quantity) ||
          rework.quantity <= 0
        )
          return false;
        const target = [...rework.targets].find((targetId) => {
          const inspection = byId.get(targetId);
          return (
            inspection &&
            targetOwners.get(targetId)?.size === 1 &&
            !usedTargets.has(targetId) &&
            Number(inspection.quantity) + 0.000001 >= rework.quantity &&
            resolve(targetId, nextVisiting)
          );
        });
        if (!target) return false;
        usedTargets.add(target);
        reworked += rework.quantity;
      }
      if (reworked + 0.000001 < ncp.quantity) return false;
    }
    releasedIds.add(id);
    return true;
  };
  for (const inspection of heldInspections) resolve(Number(inspection.id));
  return releasedIds;
}

/** Caller must hold the task row lock before locking its quality evidence. */
async function getTaskFirstArticleReleaseState(connection, task) {
  const [inspections] = await connection.query(
    `SELECT id, inspection_no, status, first_article_result, production_can_continue,
            inspector_id, actual_date, note, quantity, unqualified_quantity
       FROM quality_inspections
      WHERE inspection_type = 'first_article'
        AND (task_id = ? OR (task_id IS NULL AND reference_id = ?))
        AND deleted_at IS NULL AND (status IS NULL OR status <> 'cancelled')
      ORDER BY id FOR UPDATE`,
    [task.id, task.id]
  );
  const releasedIds = await releasedThroughRework(connection, inspections);
  return { inspections, releasedIds };
}

async function getReleasedTaskFirstArticleIds(connection, taskId) {
  return (await getTaskFirstArticleReleaseState(connection, { id: taskId })).releasedIds;
}

async function assertTaskQualityReleased(connection, task) {
  const { inspections, releasedIds } = await getTaskFirstArticleReleaseState(connection, task);
  const qualityPause = /首检|质量/.test(String(task.pause_reason || ''));
  const blocked = inspections.some((inspection) => {
    if (releasedIds.has(Number(inspection.id))) return false;
    // A new task may run its first sample while the initial inspection is pending.
    // A quality hold, failed result, or conditional decision needs explicit release.
    return (
      qualityPause ||
      ['failed', 'partial', 'passed', 'completed'].includes(inspection.status) ||
      ['failed', 'conditional', 'passed'].includes(inspection.first_article_result)
    );
  });
  if (blocked || (qualityPause && !inspections.some(isReleased))) {
    const error = new BusinessError(
      '首检尚未质量放行，不能开始或恢复生产；请先完成复检或登记有依据的条件放行',
      null,
      'QUALITY_RELEASE_REQUIRED',
      400
    );
    error.code = error.errorCode;
    error.statusCode = error.httpStatus;
    throw error;
  }
}

module.exports = { assertTaskQualityReleased, getReleasedTaskFirstArticleIds };
