export async function getSurveyById(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM surveys WHERE id = ?").bind(id).first<any>();
}
