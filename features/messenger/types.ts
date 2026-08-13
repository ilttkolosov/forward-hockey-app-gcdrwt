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

export interface MessengerPasswordChangeRequired {
  password_change_required: true;
  change_token: string;
  change_token_expires_at: string;
  user: {
    id: string;
    username: string;
  };
}

export type MessengerLoginResult =
  MessengerSession | MessengerPasswordChangeRequired;

export type MessengerMessageKind =
  "text" | "image" | "video" | "file" | "location" | "system";

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
  can_leave: boolean;
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
    media_items?: MessengerMedia[];
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

export interface MessengerRoomMember {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  online: boolean;
  last_seen_at: string | null;
}

export interface MessengerRoomSettings {
  room: MessengerRoom;
  can_manage_profile: boolean;
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
  sequence?: string;
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

export type MessengerPendingAttachmentSource =
  "camera" | "library" | "file" | "location";

export interface MessengerPendingAttachment {
  source: MessengerPendingAttachmentSource;
  stage: "preparing" | "uploading" | "failed";
  label: string;
  progress_percent?: number | null;
  local_uri: string | null;
  file_name: string | null;
  size_bytes: number | null;
  items?: {
    kind: "image" | "video" | "file";
    local_uri: string;
    file_name: string;
    size_bytes: number | null;
  }[];
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
  /** All attachments in display order. `media` remains the legacy first item. */
  media_items: MessengerMedia[];
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
  /** Local-only preparation state. It is never sent to or cached by the API. */
  pending_attachment?: MessengerPendingAttachment | null;
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

export interface MessengerPushRegistration {
  id: string;
  platform: "ios" | "android";
  enabled: boolean;
  last_registered_at: string;
  last_success_at?: string | null;
  last_error_code?: string | null;
}
