'use client';

import Modal from './Modal';
import FriendsList from './FriendsList';

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FriendsListModal({ open, onClose }: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Friends">
      <div className="space-y-3">
        <FriendsList />
        {/* Place for future: “Find friends” button */}
        {/* <Link href="/friends/find" className="rounded bg-black px-3 py-2 text-white inline-block">Find friends</Link> */}
      </div>
    </Modal>
  );
}
