export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          role: 'teacher' | 'student'
          avatar_url: string | null
          is_teacher: boolean
          is_student: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string
          role?: 'teacher' | 'student'
          avatar_url?: string | null
          is_teacher?: boolean
          is_student?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      subjects: {
        Row: { id: string; name: string; created_at: string }
        Insert: { id?: string; name: string; created_at?: string }
        Update: Partial<Database['public']['Tables']['subjects']['Insert']>
        Relationships: []
      }
      classes: {
        Row: {
          id: string
          teacher_id: string
          subject_id: string | null
          name: string
          grade: string | null
          group_name: string | null
          join_code: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          teacher_id: string
          subject_id?: string | null
          name: string
          grade?: string | null
          group_name?: string | null
          join_code: string
          description?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['classes']['Insert']>
        Relationships: []
      }
      class_members: {
        Row: { class_id: string; student_id: string; joined_at: string }
        Insert: { class_id: string; student_id: string; joined_at?: string }
        Update: Partial<Database['public']['Tables']['class_members']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      join_class: { Args: { p_join_code: string }; Returns: Database['public']['Tables']['class_members']['Row'] }
      generate_join_code: { Args: Record<string, never>; Returns: string }
    }
    Enums: { user_role: 'teacher' | 'student' }
    CompositeTypes: Record<string, never>
  }
}
