// app/community/layout.tsx
export default function CommunityLayout({
  children,
  modal, // parallel route slot
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
