export interface MessengerRole {
  code: string;
  team_season_id: string | null;
}

export interface MessengerPermission {
  code: string;
  team_season_id: string | null;
}

export interface MessengerUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  roles: MessengerRole[];
  permissions: MessengerPermission[];
}

export interface MessengerSession {
  token_type: "Bearer";
  access_token: string;
  access_token_expires_in: number;
  refresh_token: string;
  refresh_token_expires_at: string;
  user: MessengerUser;
}

export type MessengerMessageKind =
  "text" | "image" | "video" | "file" | "location";

export interface MessengerMedia {
  id: string;
  type: "image" | "video" | "file";
  mime_type: string;
  size_bytes: number;
  original_name: string;
  url: string;
}

export interface MessengerLocation {
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  label: string | null;
}

export interface InvitationPreview {
  id: string;
  status: "active" | "revoked" | "expired" | "consumed";
  can_register: boolean;
  display_name: string | null;
  team_name: string;
  season_name: string;
  role_codes: string[];
  expires_at: string;
}

export interface MessengerRoom {
  id: string;
  team_id: string;
  team_name: string;
  kind: string;
  title: string;
  sort_order: number;
  room_type: "group" | "direct" | "private_group";
  avatar_url: string | null;
  peer: null | {
    id: string;
    display_name: string;
    avatar_url: string | null;
    last_seen_at: string | null;
  };
  can_write: boolean;
  can_send_media: boolean;
  can_react: boolean;
  can_manage: boolean;
  member_count: number | null;
  last_read_sequence: string;
  last_delivered_sequence: string;
  unread_count: number;
  last_message: null | {
    id: string;
    sequence: string;
    kind: MessengerMessageKind;
    text: string;
    created_at: string;
    media: MessengerMedia | null;
    location: MessengerLocation | null;
    author: { id: string; display_name: string; avatar_url: string | null };
  };
}

export interface MessengerPrivateRoomMember {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  is_admin: boolean;
  joined_at: string;
}

export interface MessengerRoomSettings {
  room: MessengerRoom;
  can_manage_members: boolean;
  members: MessengerPrivateRoomMember[];
}

export interface MessengerContact {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_seen_at: string | null;
  team_id: string;
  team_name: string;
  family_link: boolean;
  roles: string[];
  direct_room_id: string | null;
}

export interface MessengerReaction {
  reaction: string;
  count: number;
  reacted_by_me: boolean;
}

export interface MessengerReply {
  id: string;
  kind: MessengerMessageKind;
  text: string;
  deleted_at: string | null;
  author: {
    id: string;
    display_name: string;
  };
}

export interface MessengerForward {
  message_id: string;
  author: {
    id: string;
    display_name: string;
  };
}

export interface MessengerMessage {
  id: string;
  sequence: string;
  room_id: string;
  client_message_id: string;
  kind: MessengerMessageKind;
  text: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  author: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  media: MessengerMedia | null;
  location: MessengerLocation | null;
  reply_to: MessengerReply | null;
  forwarded_from: MessengerForward | null;
  reactions: MessengerReaction[];
  delivery: {
    status: "sent" | "delivered" | "read";
    recipient_count: number;
    delivered_count: number;
    read_count: number;
  };
  pending?: boolean;
  send_error?: string | null;
}

export interface MessengerOutboxItem {
  client_message_id: string;
  room_id: string;
  text: string;
  reply_to_message_id: string | null;
  created_at: string;
  attempts: number;
  last_error: string | null;
}

export interface MessengerMessageReceipt {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  delivered_at: string | null;
  read_at: string | null;
  status: "sent" | "delivered" | "read";
}
