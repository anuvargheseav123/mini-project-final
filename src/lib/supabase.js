// Supabase configuration and database operations
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Mock Supabase client for development
class MockSupabaseClient {
  constructor() {
    this.users = new Map();
    this.camps = new Map();
    this.campSelections = new Map();
    this.volunteerAssignments = new Map();
    this.currentUser = null;
    
    // Initialize with default camps
    this.initializeDefaultCamps();
  }

  initializeDefaultCamps() {
    const defaultCamps = [
      {
        id: 'camp-1',
        name: 'Community Hall',
        beds: 50,
        original_beds: 50,
        resources: ['Food', 'Water', 'Medical Aid', 'Blankets'],
        contact: '+1-555-0101',
        ambulance: 'Yes',
        type: 'default',
        created_at: new Date().toISOString(),
        added_by_user: null
      },
      {
        id: 'camp-2',
        name: 'Government High School',
        beds: 75,
        original_beds: 75,
        resources: ['Food', 'Water', 'Clothing', 'Basic Medical'],
        contact: '+1-555-0102',
        ambulance: 'Nearby',
        type: 'default',
        created_at: new Date().toISOString(),
        added_by_user: null
      },
      {
        id: 'camp-3',
        name: 'Sports Complex',
        beds: 100,
        original_beds: 100,
        resources: ['Food', 'Water', 'Medical Aid', 'Blankets', 'Clothing'],
        contact: '+1-555-0103',
        ambulance: 'Yes',
        type: 'default',
        created_at: new Date().toISOString(),
        added_by_user: null
      }
    ];

    defaultCamps.forEach(camp => {
      this.camps.set(camp.id, camp);
    });
  }

  generateId() {
    return 'id_' + Math.random().toString(36).substr(2, 9);
  }

  // Auth methods
  async signUp(email, password, userData) {
    // Check if user already exists
    for (const [userId, user] of this.users.entries()) {
      if (user.profile.email === email) {
        throw new Error('User already exists with this email');
      }
    }

    const userId = this.generateId();
    const user = {
      id: userId,
      email,
      created_at: new Date().toISOString()
    };

    const profile = {
      id: userId,
      email,
      name: userData.name,
      role: userData.role,
      contact: userData.contact,
      address: userData.address || '',
      needs: userData.needs || '',
      skills: userData.skills || '',
      availability: userData.availability || '',
      age: userData.age,
      created_at: new Date().toISOString()
    };

    this.users.set(userId, { user, profile });
    this.currentUser = { user, profile };

    return {
      data: { user, profile },
      error: null
    };
  }

  async signIn(email, password) {
    // Find user by email
    for (const [userId, userData] of this.users.entries()) {
      if (userData.profile.email === email) {
        this.currentUser = userData;
        return {
          data: userData,
          error: null
        };
      }
    }

    throw new Error('Invalid email or password');
  }

  async signOut() {
    this.currentUser = null;
    return { error: null };
  }

  async getCurrentUser() {
    return {
      data: this.currentUser,
      error: null
    };
  }

  // Database methods
  async getCamps() {
    const camps = Array.from(this.camps.values()).map(camp => {
      // Add user info for volunteer-added camps
      if (camp.added_by_user_id) {
        const userData = this.users.get(camp.added_by_user_id);
        return {
          ...camp,
          added_by_user: userData ? userData.profile : null
        };
      }
      return camp;
    });

    return {
      data: camps,
      error: null
    };
  }

  async createCamp(campData, userId) {
    const campId = this.generateId();
    const camp = {
      id: campId,
      ...campData,
      type: 'volunteer-added',
      created_at: new Date().toISOString(),
      added_by_user_id: userId
    };

    this.camps.set(campId, camp);

    // Add user info
    const userData = this.users.get(userId);
    const campWithUser = {
      ...camp,
      added_by_user: userData ? userData.profile : null
    };

    return {
      data: campWithUser,
      error: null
    };
  }

  async deleteCamp(campId) {
    if (!this.camps.has(campId)) {
      throw new Error('Camp not found');
    }

    const camp = this.camps.get(campId);
    if (camp.type === 'default') {
      throw new Error('Cannot delete default camps');
    }

    // Remove any selections for this camp
    for (const [selectionId, selection] of this.campSelections.entries()) {
      if (selection.camp_id === campId) {
        this.campSelections.delete(selectionId);
      }
    }

    this.camps.delete(campId);
    return { error: null };
  }

  async selectCamp(userId, campId) {
    // Check if user already has a selection
    for (const selection of this.campSelections.values()) {
      if (selection.user_id === userId) {
        throw new Error('You already have a camp selected');
      }
    }

    const camp = this.camps.get(campId);
    if (!camp) {
      throw new Error('Camp not found');
    }

    if (camp.beds <= 0) {
      throw new Error('No beds available in this camp');
    }

    // Decrease bed count
    camp.beds -= 1;
    this.camps.set(campId, camp);

    // Create selection record
    const selectionId = this.generateId();
    const selection = {
      id: selectionId,
      user_id: userId,
      camp_id: campId,
      selected_at: new Date().toISOString()
    };

    this.campSelections.set(selectionId, selection);

    return {
      data: selection,
      error: null
    };
  }

  async cancelCampSelection(userId) {
    let userSelection = null;
    let selectionId = null;

    // Find user's selection
    for (const [id, selection] of this.campSelections.entries()) {
      if (selection.user_id === userId) {
        userSelection = selection;
        selectionId = id;
        break;
      }
    }

    if (!userSelection) {
      throw new Error('No camp selection found');
    }

    // Increase bed count back
    const camp = this.camps.get(userSelection.camp_id);
    if (camp) {
      camp.beds += 1;
      this.camps.set(userSelection.camp_id, camp);
    }

    // Remove selection
    this.campSelections.delete(selectionId);

    return { error: null };
  }

  async getUserCampSelection(userId) {
    for (const selection of this.campSelections.values()) {
      if (selection.user_id === userId) {
        const camp = this.camps.get(selection.camp_id);
        return {
          data: {
            ...selection,
            camp
          },
          error: null
        };
      }
    }

    return {
      data: null,
      error: { code: 'PGRST116', message: 'No selection found' }
    };
  }

  async createVolunteerAssignment(userId, campId) {
    const assignmentId = this.generateId();
    const assignment = {
      id: assignmentId,
      user_id: userId,
      camp_id: campId,
      assigned_at: new Date().toISOString()
    };

    this.volunteerAssignments.set(assignmentId, assignment);

    return {
      data: assignment,
      error: null
    };
  }

  async getVolunteerAssignments(userId) {
    const assignments = Array.from(this.volunteerAssignments.values())
      .filter(assignment => assignment.user_id === userId)
      .map(assignment => {
        const camp = this.camps.get(assignment.camp_id);
        return {
          ...assignment,
          camp
        };
      });

    return {
      data: assignments,
      error: null
    };
  }
}

// Create mock client instance
const supabase = new MockSupabaseClient();

// Export auth and database interfaces
export const auth = {
  signUp: (email, password, userData) => supabase.signUp(email, password, userData),
  signIn: (email, password) => supabase.signIn(email, password),
  signOut: () => supabase.signOut(),
  getCurrentUser: () => supabase.getCurrentUser()
};

export const db = {
  getCamps: () => supabase.getCamps(),
  createCamp: (campData, userId) => supabase.createCamp(campData, userId),
  deleteCamp: (campId) => supabase.deleteCamp(campId),
  selectCamp: (userId, campId) => supabase.selectCamp(userId, campId),
  cancelCampSelection: (userId) => supabase.cancelCampSelection(userId),
  getUserCampSelection: (userId) => supabase.getUserCampSelection(userId),
  createVolunteerAssignment: (userId, campId) => supabase.createVolunteerAssignment(userId, campId),
  getVolunteerAssignments: (userId) => supabase.getVolunteerAssignments(userId)
};

// Real-time subscriptions (mock implementation)
export const subscriptions = {
  subscribeToCamps: (callback) => {
    // Mock real-time subscription
    console.log('Subscribed to camps changes');
    return () => console.log('Unsubscribed from camps');
  },
  subscribeToCampSelections: (callback) => {
    // Mock real-time subscription
    console.log('Subscribed to camp selections changes');
    return () => console.log('Unsubscribed from camp selections');
  }
};

export default supabase;