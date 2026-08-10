/**
 * Supabase のスキーマ型。
 * `supabase/migrations/` の内容と 1:1 で対応させる。スキーマを変更したら
 * `npm run db:types`（supabase gen types）で再生成し、手で編集しないこと。
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlanTier = 'free' | 'light' | 'standard' | 'pro';
export type MemberRole = 'owner' | 'admin' | 'member';
export type CollabType =
  | 'joint_event'
  | 'mutual_referral'
  | 'bundle_product'
  | 'sns_campaign'
  | 'coupon_exchange'
  | 'other';
export type ProposalStatus =
  | 'draft'
  | 'ready'
  | 'sent'
  | 'replied'
  | 'agreed'
  | 'declined'
  | 'archived';
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          plan: PlanTier;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          plan?: PlanTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
        };
        Update: {
          name?: string;
          plan?: PlanTier;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          current_period_end?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      organization_members: {
        Row: {
          organization_id: string;
          user_id: string;
          role: MemberRole;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          user_id: string;
          role?: MemberRole;
        };
        Update: {
          role?: MemberRole;
        };
        Relationships: [
          {
            foreignKeyName: 'organization_members_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'organization_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stores: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          category: string;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          google_place_id: string | null;
          website: string | null;
          description: string | null;
          target_customer: string | null;
          strengths: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          category: string;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          google_place_id?: string | null;
          website?: string | null;
          description?: string | null;
          target_customer?: string | null;
          strengths?: string | null;
        };
        Update: {
          name?: string;
          category?: string;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          google_place_id?: string | null;
          website?: string | null;
          description?: string | null;
          target_customer?: string | null;
          strengths?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stores_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      candidates: {
        Row: {
          id: string;
          organization_id: string;
          store_id: string;
          google_place_id: string;
          name: string;
          category: string | null;
          address: string | null;
          latitude: number | null;
          longitude: number | null;
          distance_meters: number | null;
          rating: number | null;
          user_ratings_total: number | null;
          price_level: number | null;
          website: string | null;
          phone: string | null;
          photo_url: string | null;
          compatibility_score: number | null;
          score_reasons: string[];
          suggested_collab_types: CollabType[];
          is_saved: boolean;
          is_dismissed: boolean;
          raw_place_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_id: string;
          google_place_id: string;
          name: string;
          category?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          distance_meters?: number | null;
          rating?: number | null;
          user_ratings_total?: number | null;
          price_level?: number | null;
          website?: string | null;
          phone?: string | null;
          photo_url?: string | null;
          compatibility_score?: number | null;
          score_reasons?: string[];
          suggested_collab_types?: CollabType[];
          is_saved?: boolean;
          is_dismissed?: boolean;
          raw_place_data?: Json | null;
        };
        Update: {
          compatibility_score?: number | null;
          score_reasons?: string[];
          suggested_collab_types?: CollabType[];
          is_saved?: boolean;
          is_dismissed?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'candidates_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'candidates_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
      proposals: {
        Row: {
          id: string;
          organization_id: string;
          store_id: string;
          candidate_id: string;
          collab_type: CollabType;
          status: ProposalStatus;
          subject: string;
          body: string;
          model: string | null;
          generation_params: Json | null;
          sent_at: string | null;
          replied_at: string | null;
          memo: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_id: string;
          candidate_id: string;
          collab_type?: CollabType;
          status?: ProposalStatus;
          subject: string;
          body: string;
          model?: string | null;
          generation_params?: Json | null;
          memo?: string | null;
          created_by?: string | null;
        };
        Update: {
          collab_type?: CollabType;
          status?: ProposalStatus;
          subject?: string;
          body?: string;
          sent_at?: string | null;
          replied_at?: string | null;
          memo?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'proposals_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'proposals_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'proposals_candidate_id_fkey';
            columns: ['candidate_id'];
            isOneToOne: false;
            referencedRelation: 'candidates';
            referencedColumns: ['id'];
          },
        ];
      };
      search_jobs: {
        Row: {
          id: string;
          organization_id: string;
          store_id: string;
          status: JobStatus;
          radius_meters: number;
          categories: string[];
          found_count: number;
          error_message: string | null;
          started_at: string | null;
          finished_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          store_id: string;
          status?: JobStatus;
          radius_meters?: number;
          categories?: string[];
        };
        Update: {
          status?: JobStatus;
          found_count?: number;
          error_message?: string | null;
          started_at?: string | null;
          finished_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'search_jobs_organization_id_fkey';
            columns: ['organization_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'search_jobs_store_id_fkey';
            columns: ['store_id'];
            isOneToOne: false;
            referencedRelation: 'stores';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_organization: {
        Args: { org_name: string };
        Returns: Database['public']['Tables']['organizations']['Row'];
      };
      is_org_member: {
        Args: { target_org: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { target_org: string };
        Returns: boolean;
      };
    };
    Enums: {
      plan_tier: PlanTier;
      member_role: MemberRole;
      collab_type: CollabType;
      proposal_status: ProposalStatus;
      job_status: JobStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
}

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];
