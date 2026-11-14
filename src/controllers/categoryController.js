const categoryService = require('../services/categoryService');
const userRepository = require('../repositories/userRepository');

const formatCategoryDto = async (c) => {
  const dto = {
    id: c.id,
    name: c.name,
    description: c.description,
    color: c.color,
    isDefault: !!(c.is_default || c.isDefault),
    isOccupationGenerated: !!(c.is_occupation_generated || c.isOccupationGenerated),
  };

  const userId = c.user_id || c.userId;
  if (userId) {
    if (c.user_username) {
      dto.user = { id: userId, username: c.user_username };
    } else {
      const u = await userRepository.findById(userId);
      if (u) {
        dto.user = { id: u.id, username: u.username };
      }
    }
  }

  return dto;
};

class CategoryController {
  async getAllCategories(req, res, next) {
    try {
      const categories = await categoryService.getAllCategories(req.user);
      const dtos = await Promise.all(categories.map(formatCategoryDto));
      res.json(dtos);
    } catch (err) {
      next(err);
    }
  }

  async getCategory(req, res, next) {
    try {
      const c = await categoryService.getCategory(req.user, req.params.id);
      const dto = await formatCategoryDto(c);
      res.json(dto);
    } catch (err) {
      next(err);
    }
  }

  async createCategory(req, res, next) {
    try {
      const c = await categoryService.createCategory(req.user, req.body);
      const dto = await formatCategoryDto(c);
      res.status(201).json(dto);
    } catch (err) {
      next(err);
    }
  }

  async updateCategory(req, res, next) {
    try {
      const c = await categoryService.updateCategory(req.user, req.params.id, req.body);
      const dto = await formatCategoryDto(c);
      res.json(dto);
    } catch (err) {
      next(err);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      await categoryService.deleteCategory(req.user, req.params.id);
      res.status(200).send();
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CategoryController();

