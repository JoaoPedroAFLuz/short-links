import fastify from 'fastify';
import { PostgresError } from 'postgres';
import { z } from 'zod';

import { sql } from './lib/postgres';
import { redis } from './lib/redis';

const app = fastify();

app.get('/:code', async (request, reply) => {
  const getCodeSchema = z.object({
    code: z.string().min(3),
  });

  const { code } = getCodeSchema.parse(request.params);

  const result = await sql/* sql */ `
  SELECT id, code, original_url 
  FROM short_links sl
  WHERE sl.code = ${code.toLocaleLowerCase()};
  `;

  if (result.length === 0) {
    return reply
      .status(404)
      .send({ message: `Link not found with code: ${code}` });
  }

  const link = result[0];

  await redis.zIncrBy('metrics', 1, link.code);

  return reply.redirect(301, link.original_url);
});

app.get('/api/metrics', async (_, reply) => {
  const result = await redis.zRangeByScoreWithScores('metrics', 0, 50);

  const metrics = result
    .sort((a, b) => b.score - a.score)
    .map((item) => {
      return {
        code: item.value,
        hits: item.score,
      };
    });

  return reply.send(metrics);
});

app.get('/api/metrics/:code', async (request, reply) => {
  const getCodeSchema = z.object({
    code: z.string().min(3),
  });

  const { code } = getCodeSchema.parse(request.params);

  const result = await redis.zScore('metrics', code);

  if (!result) {
    return reply
      .status(404)
      .send({ message: `Metrics not found with code: ${code}` });
  }

  return reply.send({ code, clicks: result });
});

app.get('/api/links', async (_, reply) => {
  const links = await sql/* sql */ `
    SELECT * 
    FROM short_links
    ORDER BY created_at DESC;
  `;

  reply.send(links);
});

app.post('/api/links', async (request, reply) => {
  const createShortLink = z.object({
    code: z.string().min(3),
    url: z.string().url(),
  });

  const { code, url } = createShortLink.parse(request.body);

  try {
    const result = await sql/* sql */ `
      INSERT INTO short_links (code, original_url)
      VALUES (${code.toLocaleLowerCase()}, ${url})
      RETURNING id;
   `;

    const link = result[0];

    reply.status(201).send({ shortLinkId: link.id });
  } catch (error) {
    if (error instanceof PostgresError) {
      if (error.code === '23505') {
        return reply.status(400).send({ message: 'Duplicated code' });
      }
    }

    console.error(error);

    reply.status(500).send({ error: 'Internal server error' });
  }
});

app.listen({ port: 3000 }).then(() => {
  console.log('Server running on port 3000');
});
