"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReloadButton() {
	const router = useRouter();

	return (
		<Button
			type="button"
			onClick={() => {
				router.refresh();
			}}
			variant="outline"
		>
			Reload page
		</Button>
	);
}
