import { TransactionDetail } from "@/components/transactions/transaction-detail";

//export const dynamic = "force-dynamic";

// Next.js 16: params is a Promise — await it.
export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TransactionDetail id={id} />;
}
