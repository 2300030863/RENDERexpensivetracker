const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const occupationRepository = require('../repositories/occupationRepository');

async function initializeData() {
  try {
    // 1. Initialize default OWNER user if not exists
    const ownerExists = await userRepository.existsByUsername('SIVESH');
    if (!ownerExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Sivesh@167', salt);

      await userRepository.create({
        username: 'SIVESH',
        email: 'siveshkommalapati167@gmail.com',
        password: hashedPassword,
        firstName: 'SIVESH',
        lastName: 'KOMMALAPATI',
        country: 'India',
        role: 'ROLE_OWNER',
        blocked: false,
        isOAuthUser: false,
      });
      console.log('✓ Default OWNER user created: SIVESH');
    } else {
      console.log('✓ Default user already exists: SIVESH');
    }

    // 2. Initialize Occupations and Templates
    const occupationCount = await occupationRepository.count();
    console.log(`📊 Current occupation count: ${occupationCount}`);

    const allOccupations = await occupationRepository.findAll();
    const farmerExists = allOccupations.some(o => o.occupation_type === 'FARMER');

    if (!farmerExists) {
      console.log('🚜 Farmer occupation not found. Adding it now...');
      const farmer = await occupationRepository.createOccupation(
        'Farmer',
        'FARMER',
        'For farmers and agricultural workers'
      );
      await createFarmerCategories(farmer.id);
      console.log('✅ Farmer occupation added successfully!');
    }

    if (occupationCount === 0) {
      console.log('🎯 Initializing occupation data...');
      await initializeAllOccupations();
      const finalCount = await occupationRepository.count();
      console.log(`✅ Occupation data initialized successfully! Final count: ${finalCount}`);
    } else {
      console.log(`ℹ️ Occupations already exist. Total count: ${occupationCount}`);
    }
  } catch (error) {
    console.error('⚠️ Failed to initialize application data:', error.message);
  }
}

async function initializeAllOccupations() {
  // 1. Student
  const student = await occupationRepository.createOccupation('Student', 'STUDENT', 'For students in school, college, or university');
  await createStudentCategories(student.id);

  // 2. Software Engineer / IT Professional
  const softwareEngineer = await occupationRepository.createOccupation(
    'Software Engineer / IT Professional',
    'SOFTWARE_ENGINEER',
    'For software developers, IT professionals, and tech workers'
  );
  await createSoftwareEngineerCategories(softwareEngineer.id);

  // 3. Business Owner / UMKM
  const businessOwner = await occupationRepository.createOccupation(
    'Business Owner / UMKM',
    'BUSINESS_OWNER',
    'For small business owners, retail shop owners, and UMKM'
  );
  await createBusinessOwnerCategories(businessOwner.id);

  // 4. Delivery Driver / Ojek Partner
  const deliveryDriver = await occupationRepository.createOccupation(
    'Delivery Driver / Ojek Partner',
    'DELIVERY_DRIVER',
    'For taxi drivers, delivery riders, and transport partners'
  );
  await createDeliveryDriverCategories(deliveryDriver.id);

  // 5. Freelancer / Creator
  const freelancer = await occupationRepository.createOccupation(
    'Freelancer / Creator',
    'FREELANCER',
    'For freelancers, content creators, and independent contractors'
  );
  await createFreelancerCategories(freelancer.id);

  // 6. Homemaker
  const homemaker = await occupationRepository.createOccupation(
    'Homemaker',
    'HOMEMAKER',
    'For people managing household expenses'
  );
  await createHomemakerCategories(homemaker.id);

  // 7. Salaried Employee
  const salariedEmployee = await occupationRepository.createOccupation(
    'Salaried Employee',
    'SALARIED_EMPLOYEE',
    'For salaried professionals in private sector'
  );
  await createSalariedEmployeeCategories(salariedEmployee.id);

  // 8. Farmer
  const farmer = await occupationRepository.createOccupation('Farmer', 'FARMER', 'For farmers and agricultural workers');
  await createFarmerCategories(farmer.id);

  // 9. Other
  const other = await occupationRepository.createOccupation('Other', 'OTHER', 'General expense categories for any occupation');
  await createOtherCategories(other.id);
}

async function createStudentCategories(occId) {
  const templates = [
    ['Tuition & Fees', 'College/school fees, exam fees', '#FF5722', 1],
    ['Books & Stationery', 'Textbooks, notebooks, supplies', '#2196F3', 2],
    ['Hostel / Rent', 'Accommodation expenses', '#9C27B0', 3],
    ['Food', 'Canteen, mess, or outside food', '#FF9800', 4],
    ['Transport', 'Bus, train, or local travel', '#4CAF50', 5],
    ['Internet & Mobile', 'Data plans and recharges', '#00BCD4', 6],
    ['Entertainment', 'Movies, games, outings', '#E91E63', 7],
    ['Miscellaneous', 'Other student expenses', '#607D8B', 8],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createSoftwareEngineerCategories(occId) {
  const templates = [
    ['Rent / PG', 'Housing or accommodation', '#9C27B0', 1],
    ['Food & Groceries', 'Daily meals and grocery shopping', '#FF9800', 2],
    ['Internet', 'Broadband and WiFi', '#00BCD4', 3],
    ['Mobile', 'Phone bills and recharges', '#2196F3', 4],
    ['Subscriptions', 'Cloud services, tools, SaaS', '#FF5722', 5],
    ['Transport', 'Commute and travel', '#4CAF50', 6],
    ['Skill Development', 'Courses, certifications, books', '#673AB7', 7],
    ['Gadgets & Tech', 'Laptops, accessories, upgrades', '#009688', 8],
    ['Health & Fitness', 'Gym, healthcare', '#E91E63', 9],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createBusinessOwnerCategories(occId) {
  const templates = [
    ['Inventory / Stock', 'Product purchases and supplies', '#FF5722', 1],
    ['Shop Rent', 'Store or office rent', '#9C27B0', 2],
    ['Utilities', 'Electricity, water, gas', '#FFC107', 3],
    ['Employee Salary', 'Staff wages and payments', '#4CAF50', 4],
    ['Transport & Delivery', 'Shipping and logistics', '#2196F3', 5],
    ['Marketing', 'Ads, promotions, social media', '#E91E63', 6],
    ['Equipment', 'Tools, machinery, furniture', '#607D8B', 7],
    ['Licenses & Permits', 'Government fees and compliance', '#795548', 8],
    ['Miscellaneous Business', 'Other business costs', '#9E9E9E', 9],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createDeliveryDriverCategories(occId) {
  const templates = [
    ['Fuel', 'Petrol, diesel, CNG', '#FF5722', 1],
    ['Vehicle Maintenance', 'Repairs, servicing, parts', '#607D8B', 2],
    ['Mobile Data', 'Internet and call recharges', '#00BCD4', 3],
    ['Food', 'Meals during work', '#FF9800', 4],
    ['Parking & Toll', 'Parking fees and tolls', '#4CAF50', 5],
    ['EMI / Bike Rent', 'Vehicle loan or rental', '#9C27B0', 6],
    ['Insurance', 'Vehicle insurance', '#2196F3', 7],
    ['Miscellaneous', 'Other work-related expenses', '#9E9E9E', 8],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createFreelancerCategories(occId) {
  const templates = [
    ['Software & Tools', 'Subscriptions and software licenses', '#FF5722', 1],
    ['Internet', 'WiFi and connectivity', '#00BCD4', 2],
    ['Marketing', 'Ads, portfolio, branding', '#E91E63', 3],
    ['Equipment', 'Camera, laptop, accessories', '#607D8B', 4],
    ['Workspace', 'Co-working space or rent', '#9C27B0', 5],
    ['Travel', 'Client meetings, events', '#4CAF50', 6],
    ['Taxes & Savings', 'Income tax, investments', '#FFC107', 7],
    ['Professional Development', 'Courses, networking', '#673AB7', 8],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createHomemakerCategories(occId) {
  const templates = [
    ['Groceries', 'Daily household supplies', '#4CAF50', 1],
    ['Utilities', 'Electricity, water, gas bills', '#FFC107', 2],
    ['Children\'s Education', 'School fees, supplies', '#2196F3', 3],
    ['Healthcare', 'Medical expenses, medicines', '#E91E63', 4],
    ['House Rent / EMI', 'Housing expenses', '#9C27B0', 5],
    ['Transport', 'Travel and commute', '#00BCD4', 6],
    ['Entertainment', 'Family outings, subscriptions', '#FF9800', 7],
    ['Household Items', 'Furniture, appliances, repairs', '#607D8B', 8],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createSalariedEmployeeCategories(occId) {
  const templates = [
    ['Rent / EMI', 'Housing expenses', '#9C27B0', 1],
    ['Food & Groceries', 'Meals and grocery', '#FF9800', 2],
    ['Transport', 'Commute expenses', '#4CAF50', 3],
    ['Utilities', 'Bills and services', '#FFC107', 4],
    ['Healthcare', 'Medical and insurance', '#E91E63', 5],
    ['Entertainment', 'Movies, dining, hobbies', '#673AB7', 6],
    ['Savings & Investments', 'SIP, FD, stocks', '#2196F3', 7],
    ['Personal Care', 'Grooming and wellness', '#00BCD4', 8],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createFarmerCategories(occId) {
  const templates = [
    ['Seeds & Fertilizers', 'Seeds, fertilizers, and pesticides', '#8BC34A', 1],
    ['Equipment & Machinery', 'Farm equipment and machinery', '#FF9800', 2],
    ['Livestock', 'Animal feed and veterinary', '#795548', 3],
    ['Irrigation & Water', 'Water supply and irrigation costs', '#2196F3', 4],
    ['Fuel & Energy', 'Diesel, electricity, and energy', '#FF5722', 5],
    ['Labor', 'Hired labor and wages', '#9C27B0', 6],
    ['Land Lease', 'Land rental and property tax', '#607D8B', 7],
    ['Transportation', 'Transport and logistics', '#4CAF50', 8],
    ['Storage & Packaging', 'Storage and packaging materials', '#FFC107', 9],
    ['Personal Expenses', 'Household and personal needs', '#E91E63', 10],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

async function createOtherCategories(occId) {
  const templates = [
    ['Food', 'Meals and dining', '#FF9800', 1],
    ['Transport', 'Travel expenses', '#4CAF50', 2],
    ['Bills', 'Utilities and services', '#FFC107', 3],
    ['Shopping', 'Clothing and personal items', '#E91E63', 4],
    ['Entertainment', 'Leisure activities', '#673AB7', 5],
    ['Healthcare', 'Medical expenses', '#2196F3', 6],
    ['Miscellaneous', 'Other expenses', '#9E9E9E', 7],
  ];
  for (const [name, desc, color, order] of templates) {
    await occupationRepository.createTemplate(occId, name, desc, color, order);
  }
}

module.exports = {
  initializeData,
};

