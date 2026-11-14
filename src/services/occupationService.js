const occupationRepository = require('../repositories/occupationRepository');
const categoryRepository = require('../repositories/categoryRepository');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');

class OccupationService {
  async getAllOccupations() {
    const occupations = await occupationRepository.findAll();
    return occupations.map(o => ({
      id: o.id,
      name: o.name,
      occupationType: o.occupation_type,
      description: o.description,
    }));
  }

  async getOccupationWithCategories(occupationId) {
    const occupation = await occupationRepository.findById(occupationId);
    if (!occupation) {
      throw new Error('Occupation not found');
    }

    const templates = await occupationRepository.findTemplatesByOccupationId(occupationId);
    const categories = templates.map(t => ({
      categoryName: t.category_name,
      description: t.description,
      color: t.color,
    }));

    return {
      id: occupation.id,
      name: occupation.name,
      occupationType: occupation.occupation_type,
      description: occupation.description,
      categories,
    };
  }

  async generateCategoriesForUser(user, occupationId) {
    console.log(`[OccupationService] Generating categories for user ${user.username}, occupationId: ${occupationId}`);

    const managedUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!managedUser) throw new Error('User not found');

    let targetOccupationId = occupationId;

    // For group users, check if admin has an occupation and use that
    if (managedUser.user_group_id) {
      const groupAdminUsername = managedUser.group_admin_username;
      if (groupAdminUsername) {
        const adminUser = await userRepository.findByUsername(groupAdminUsername);
        if (adminUser && adminUser.occupation_id) {
          targetOccupationId = adminUser.occupation_id;
          console.log(`[OccupationService] User is in group, using group admin occupation ID: ${targetOccupationId}`);
        }
      }
    }

    const occupation = await occupationRepository.findById(targetOccupationId);
    if (!occupation) throw new Error('Occupation not found');

    // Update user's occupation
    await userRepository.update(managedUser.id, { occupation_id: targetOccupationId });

    // Fetch templates for this occupation
    const templates = await occupationRepository.findTemplatesByOccupationId(targetOccupationId);

    // Create categories
    for (const t of templates) {
      await categoryRepository.create({
        name: t.category_name,
        description: t.description,
        color: t.color,
        isDefault: false,
        isOccupationGenerated: true,
        userId: managedUser.id,
      });
    }

    console.log(`[OccupationService] Created ${templates.length} categories for user ${managedUser.username}`);
  }

  async updateUserOccupation(user, occupationId) {
    console.log(`[OccupationService] Updating occupation for user ${user.username} (ID: ${user.id}) to ${occupationId}`);

    const managedUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!managedUser) throw new Error('User not found');

    // Delete existing occupation-generated categories for user
    const existingCats = await categoryRepository.findByUserIdAndIsOccupationGenerated(managedUser.id, true);
    if (existingCats.length > 0) {
      await categoryRepository.deleteAll(existingCats.map(c => c.id));
      console.log(`[OccupationService] Deleted ${existingCats.length} old categories`);
    }

    // Generate new categories
    await this.generateCategoriesForUser(managedUser, occupationId);

    // If user is ADMIN, sync with all group members
    if (managedUser.role === 'ROLE_ADMIN') {
      console.log(`[OccupationService] User is ADMIN, updating group members...`);
      const admin = await adminRepository.findByUsername(managedUser.username);
      if (admin) {
        // Find users in groups managed by this admin
        const groupUsers = await userRepository.findByUserGroupAdminId(admin.id);
        console.log(`[OccupationService] Found ${groupUsers.length} group members to update`);

        const templates = await occupationRepository.findTemplatesByOccupationId(occupationId);

        for (const member of groupUsers) {
          // Delete old categories for member
          const memberCats = await categoryRepository.findByUserIdAndIsOccupationGenerated(member.id, true);
          if (memberCats.length > 0) {
            await categoryRepository.deleteAll(memberCats.map(c => c.id));
          }

          // Update member occupation
          await userRepository.update(member.id, { occupation_id: occupationId });

          // Create categories for member
          for (const t of templates) {
            await categoryRepository.create({
              name: t.category_name,
              description: t.description,
              color: t.color,
              isDefault: false,
              isOccupationGenerated: true,
              userId: member.id,
            });
          }
        }
      }
    }

    console.log(`[OccupationService] Occupation update completed successfully`);
  }
}

module.exports = new OccupationService();

