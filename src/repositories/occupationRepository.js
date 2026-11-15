const { query, execute } = require('../config/database');

class OccupationRepository {
  async findAll() {
    return await query('SELECT * FROM occupations ORDER BY name ASC');
  }

  async findById(id) {
    const rows = await query('SELECT * FROM occupations WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByType(occupationType) {
    const rows = await query('SELECT * FROM occupations WHERE occupation_type = ?', [occupationType]);
    return rows[0] || null;
  }

  async count() {
    const [row] = await query('SELECT COUNT(*) as count FROM occupations');
    return row ? row.count : 0;
  }

  async findTemplatesByOccupationId(occupationId) {
    const sql = `
      SELECT * FROM occupation_category_templates 
      WHERE occupation_id = ? 
      ORDER BY display_order ASC
    `;
    return await query(sql, [occupationId]);
  }

  async createOccupation(name, occupationType, description) {
    const sql = `
      INSERT INTO occupations (name, occupation_type, description, created_at)
      VALUES (?, ?, ?, NOW())
    `;
    const result = await execute(sql, [name, occupationType, description]);
    return await this.findById(result.insertId);
  }

  async createTemplate(occupationId, categoryName, description, color, displayOrder) {
    const sql = `
      INSERT INTO occupation_category_templates (occupation_id, category_name, description, color, display_order, created_at)
      VALUES (?, ?, ?, ?, ?, NOW())
    `;
    const result = await execute(sql, [occupationId, categoryName, description, color, displayOrder]);
    const [row] = await query('SELECT * FROM occupation_category_templates WHERE id = ?', [result.insertId]);
    return row;
  }
}

module.exports = new OccupationRepository();

