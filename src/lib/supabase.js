import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Auth helpers
export const auth = {
  async signUp(email, password, userData) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      })

      if (authError) throw authError

      if (authData.user) {
        // Create user profile
        const { error: profileError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
            age: parseInt(userData.age),
            contact: userData.contact,
            address: userData.address || null,
            needs: userData.needs || null,
            skills: userData.skills || null,
            availability: userData.availability || null
          }])

        if (profileError) throw profileError
      }

      return { data: authData, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  async signIn(email, password) {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) throw authError

      if (authData.user) {
        // Get user profile
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .single()

        if (profileError) throw profileError

        return { data: { ...authData, profile }, error: null }
      }

      return { data: authData, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  async getCurrentUser() {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      
      if (userError) throw userError
      if (!user) return { data: null, error: null }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      if (profileError) throw profileError

      return { data: { user, profile }, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }
}

// Database helpers
export const db = {
  // Camps
  async getCamps() {
    const { data, error } = await supabase
      .from('camps')
      .select(`
        *,
        added_by_user:users(name)
      `)
      .order('created_at', { ascending: true })

    return { data, error }
  },

  async createCamp(campData, userId) {
    const { data, error } = await supabase
      .from('camps')
      .insert([{
        ...campData,
        added_by: userId,
        type: 'volunteer-added'
      }])
      .select()
      .single()

    return { data, error }
  },

  async deleteCamp(campId) {
    const { error } = await supabase
      .from('camps')
      .delete()
      .eq('id', campId)

    return { error }
  },

  // Camp selections
  async getUserCampSelection(userId) {
    const { data, error } = await supabase
      .from('camp_selections')
      .select(`
        *,
        camp:camps(*)
      `)
      .eq('user_id', userId)
      .single()

    return { data, error }
  },

  async selectCamp(userId, campId) {
    const { data, error } = await supabase
      .from('camp_selections')
      .insert([{
        user_id: userId,
        camp_id: campId
      }])
      .select()
      .single()

    return { data, error }
  },

  async cancelCampSelection(userId) {
    const { error } = await supabase
      .from('camp_selections')
      .delete()
      .eq('user_id', userId)

    return { error }
  },

  // Volunteer assignments
  async getVolunteerAssignments(volunteerId) {
    const { data, error } = await supabase
      .from('volunteer_assignments')
      .select(`
        *,
        camp:camps(*)
      `)
      .eq('volunteer_id', volunteerId)
      .order('assigned_at', { ascending: false })

    return { data, error }
  },

  async createVolunteerAssignment(volunteerId, campId) {
    const { data, error } = await supabase
      .from('volunteer_assignments')
      .insert([{
        volunteer_id: volunteerId,
        camp_id: campId
      }])
      .select()
      .single()

    return { data, error }
  }
}

// Real-time subscriptions
export const subscriptions = {
  subscribeToCamps(callback) {
    return supabase
      .channel('camps-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'camps' }, 
        callback
      )
      .subscribe()
  },

  subscribeToCampSelections(callback) {
    return supabase
      .channel('camp-selections-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'camp_selections' }, 
        callback
      )
      .subscribe()
  }
}