import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    let hasMore = true;
    let iterations = 0;
    const cap = 20;
    while (hasMore && iterations < cap) {
      const res = await base44.asServiceRole.entities.Exercise.updateMany(
        { submission_status: { $ne: 'approved' } },
        { $set: { submission_status: 'approved' } }
      );
      hasMore = !!res.has_more;
      iterations += 1;
    }
    return Response.json({ done: !hasMore, iterations, hasMore });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}