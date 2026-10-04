// Soapbox: Jincheng's posts, sent from Telegram, and everyone's reactions
// to them. The Supabase side is supabase/soapbox.ts, the stand-in's
// local/soapbox.ts.

export const REACTIONS = ['👍', '😂', '🫂', '🔥'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** A photo on a Soapbox post, in Supabase Storage. */
export interface PostImage {
  url: string;
  width: number;
  height: number;
}

/** A Soapbox post: Jincheng's own note or rant, sent from Telegram. */
export interface Post {
  id: string;
  body: string;
  kind: 'note' | 'rant';
  place: string | null;
  weather: string | null;
  created_at: string;
  /** Photos sent with it, in the order they were sent; none for most posts. */
  images: PostImage[];
  /** How many of each reaction it has. */
  reactions: Partial<Record<Reaction, number>>;
}

export interface SoapboxSocial {
  /** The newest Soapbox posts, with their reaction counts. */
  listPosts: () => Promise<Post[]>;
  /** The signed-in member's own reactions, by post. */
  myReactions: () => Promise<Record<string, Reaction>>;
  /**
   * Reacts to a post. Members can change their reaction or take it back
   * (null); anyone else gets one per post and a second is refused.
   */
  react: (postId: string, reaction: Reaction | null) => Promise<void>;
}
