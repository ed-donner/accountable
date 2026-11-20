import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { useChangeActivity } from "@/api/activities";
import type { LoggableType, TimelineEntry } from "@/api/types";
import { TypePicker } from "@/components/timeline/TypePicker";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { localInputToUtc, utcToLocalInput } from "@/lib/dates";
import { messages } from "@/lib/words";
import { Field, FormDialog, fieldAria, showSaveError } from "./FormDialog";
import { activitySchema, type ActivityValues } from "./schemas";
import { z } from "zod";

const editSchema = activitySchema.extend({ done: z.boolean() });
type EditValues = z.input<typeof editSchema>;
const FIELDS = ["type", "description", "occurred_at", "follow_up_date", "done"] as const;

function valuesOf(entry: TimelineEntry | null): EditValues {
  return {
    type: (entry?.type === "stage_change" ? "note" : entry?.type) ?? "note",
    description: entry?.description ?? "",
    occurred_at: entry ? utcToLocalInput(entry.occurred_at) : "",
    follow_up_date: entry?.follow_up_date ?? "",
    done: entry?.done ?? false,
  };
}

/** Edits a note, call or email: type, description, when, follow-up date and done (ACT-4). */
export function ActivityForm({
  entry,
  onOpenChange,
}: {
  entry: TimelineEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const change = useChangeActivity();
  const form = useForm<EditValues>({ resolver: zodResolver(editSchema), defaultValues: valuesOf(entry) });
  const { register, handleSubmit, reset, setError, setValue, control, formState } = form;
  const errors = formState.errors;
  const type = useWatch({ control, name: "type" }) as LoggableType;
  const followUp = useWatch({ control, name: "follow_up_date" });

  useEffect(() => {
    if (entry) reset(valuesOf(entry));
  }, [entry, reset]);

  const onSubmit = handleSubmit((values: ActivityValues & { done: boolean }) => {
    if (!entry) return;
    change.mutate(
      {
        id: entry.id,
        changes: {
          type: values.type as LoggableType,
          description: values.description.trim(),
          occurred_at: localInputToUtc(values.occurred_at),
          follow_up_date: values.follow_up_date || null,
          done: values.follow_up_date ? values.done : false,
        },
      },
      {
        onSuccess: () => {
          toast.success(messages.saved);
          onOpenChange(false);
        },
        onError: (error) => showSaveError(error, setError, FIELDS),
      },
    );
  });

  return (
    <FormDialog
      open={entry !== null}
      onOpenChange={onOpenChange}
      title="Edit activity"
      submitLabel="Save changes"
      pending={change.isPending}
      onSubmit={onSubmit}
    >
      <TypePicker value={type} onChange={(next) => setValue("type", next)} />
      <Field id="activity-description" label="Description" required error={errors.description?.message}>
        <Textarea
          {...fieldAria("activity-description", errors.description?.message)}
          rows={4}
          {...register("description")}
        />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field id="activity-when" label="When" required error={errors.occurred_at?.message}>
          <Input
            {...fieldAria("activity-when", errors.occurred_at?.message)}
            type="datetime-local"
            {...register("occurred_at")}
          />
        </Field>
        <Field id="activity-follow-up" label="Follow-up date" error={errors.follow_up_date?.message}>
          <Input
            {...fieldAria("activity-follow-up", errors.follow_up_date?.message)}
            type="date"
            {...register("follow_up_date")}
          />
        </Field>
      </div>
      {followUp && (
        <Controller
          control={control}
          name="done"
          render={({ field }) => (
            <label htmlFor="activity-done" className="flex items-center gap-2 text-[14px] text-ink">
              <Checkbox
                id="activity-done"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              Follow-up done
            </label>
          )}
        />
      )}
    </FormDialog>
  );
}
