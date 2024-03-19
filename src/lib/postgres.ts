import postgres from 'postgres';

export const sql = postgres({
  user: 'JoaoPedroAFLuz',
  password: 'docker',
  host: 'localhost',
  port: 5432,
  database: 'short_links',
});
