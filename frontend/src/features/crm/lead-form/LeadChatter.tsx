import {
  useAddNote,
  useDeleteAttachment,
  useDeleteTimelineEntry,
  useEditNote,
  useLeadAttachments,
  useLeadTimeline,
  useUploadAttachment,
} from "@/shared/api/hooks";
import type { Attachment } from "@/shared/types";
import { Chatter } from "@/shared/ui/chatter";

interface LeadChatterProps {
  leadId: string;
  authorInitials: string;
  currentUserId?: number;
  readOnly: boolean;
  onPreview: (file: Attachment) => void;
}

/**
 * Лента, заметки и вложения сохранённого лида. Здесь собраны её запросы,
 * мутации и привязка выбранных файлов к только что созданной записи.
 */
export function LeadChatter({
  leadId,
  authorInitials,
  currentUserId,
  readOnly,
  onPreview,
}: LeadChatterProps) {
  const { data: timeline = [] } = useLeadTimeline(leadId);
  const { data: attachments = [] } = useLeadAttachments(leadId);

  const addNote = useAddNote(leadId);
  const editNote = useEditNote(leadId);
  const deleteTimelineEntry = useDeleteTimelineEntry(leadId);
  const uploadAttachment = useUploadAttachment(leadId);
  const deleteAttachment = useDeleteAttachment(leadId);

  return (
    <Chatter
      timeline={timeline}
      authorInitials={authorInitials}
      attachments={attachments}
      posting={addNote.isPending || uploadAttachment.isPending}
      uploading={uploadAttachment.isPending}
      onSubmit={(body, files) => {
        // Сначала создаём запись ленты, затем цепляем к ней файлы: так
        // вложения попадают именно в эту строку, а не в соседнюю.
        if (!body && files.length === 0) return;
        addNote.mutate(body || "Вложение", {
          onSuccess: (entry) => {
            for (const file of files) {
              uploadAttachment.mutate({
                file,
                entryId: Number(entry.id),
              });
            }
          },
        });
      }}
      onUpload={(file, entryId) => uploadAttachment.mutate({ file, entryId })}
      onDelete={(file) => deleteAttachment.mutate(file.id)}
      onPreview={onPreview}
      onEditNote={(entryId, body) => editNote.mutate({ entryId, body })}
      onDeleteEntry={(entry) => deleteTimelineEntry.mutate(Number(entry.id))}
      currentUserId={currentUserId}
      readOnly={readOnly}
    />
  );
}
