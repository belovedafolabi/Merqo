import { TablePageSkeleton } from '@/components/states/skeletons'

/**
 * Generic route-transition fallback for every admin screen without its own
 * `loading.tsx`. Per docs/UXUI_Design_System_Specification.md §49
 * ("Skeletons rather than blank screens"). Segments with a distinctive shape
 * (dashboard cards, wide inventory table) override this with a co-located file.
 */
export default function Loading() {
  return <TablePageSkeleton />
}
