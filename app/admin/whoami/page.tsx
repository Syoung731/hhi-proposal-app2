import { currentUser } from "@clerk/nextjs/server";

export default async function WhoAmI() {
  const user = await currentUser();

  return (
    <pre style={{ padding: 24, whiteSpace: "pre-wrap" }}>
      {JSON.stringify(
        {
          id: user?.id,
          username: user?.username,
          primaryEmailAddressId: user?.primaryEmailAddressId,
          emailAddresses: user?.emailAddresses?.map((e) => ({
            id: e.id,
            emailAddress: e.emailAddress,
            verification: e.verification,
          })),
        },
        null,
        2
      )}
    </pre>
  );
}
