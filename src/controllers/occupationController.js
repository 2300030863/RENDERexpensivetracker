const occupationService = require('../services/occupationService');

class OccupationController {
  async getAllOccupations(req, res, next) {
    try {
      const occupations = await occupationService.getAllOccupations();
      return res.status(200).json(occupations);
    } catch (error) {
      console.error('Get occupations error:', error);
      return res.status(500).json({ error: 'Failed to fetch occupations' });
    }
  }

  async getOccupationWithCategories(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      const occupation = await occupationService.getOccupationWithCategories(id);
      return res.status(200).json(occupation);
    } catch (error) {
      console.error('Get occupation details error:', error);
      if (error.message === 'Occupation not found') {
        return res.status(404).json({ error: error.message });
      }
      return res.status(500).json({ error: 'Failed to fetch occupation details' });
    }
  }

  async getOccupationById(req, res, next) {
    return this.getOccupationWithCategories(req, res, next);
  }

  async getOccupationCategories(req, res, next) {
    return this.getOccupationWithCategories(req, res, next);
  }

  async updateUserOccupation(req, res, next) {
    try {
      const { occupationId } = req.body;
      if (!occupationId) {
        return res.status(400).json({ message: 'Occupation ID is required' });
      }

      await occupationService.updateUserOccupation(req.user, occupationId);

      return res.status(200).json({
        message: 'Occupation updated successfully',
      });
    } catch (error) {
      console.error('Update occupation error:', error);
      return res.status(400).json({ message: error.message });
    }
  }
}

module.exports = new OccupationController();
