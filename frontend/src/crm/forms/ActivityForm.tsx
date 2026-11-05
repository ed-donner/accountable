import { zodResolver } from "@hookform/resolvers/zod";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { Field } from "../../components/Field";
import { FormDialog } from "../../components/FormDialog";
import { useNotify } from "../../lib/notify";
import { showSaveError } from "../../lib/saveErrors";
import { capitalize } from "../../lib/words";
import {
  useAddActivity,
  useEditActivity,
  type ActivityType,
  type ActivityValues,
  type TimelineEntry,
} from "../queries";

const TYPES: ActivityType[] = ["note", "call", "email"];

const schema = z.object({
  type: z.enum(["note", "call", "email"]),
  description: z.string().trim().min(1, "Enter a description"),
  occurred_at: z.string().min(1, "Choose when it happened"),
  follow_up_date: z.string(),
  follow_up_done: z.boolean(),
});

type Values = z.infer<typeof schema>;

const LOCAL_TIME = "yyyy-MM-dd'T'HH:mm";

function initialValues(entry?: TimelineEntry): Values {
  return {
    type: entry?.type ?? "note",
    description: entry?.description ?? "",
    occurred_at: format(entry ? parseISO(entry.at) : new Date(), LOCAL_TIME),
    follow_up_date: entry?.follow_up_date ?? "",
    follow_up_done: entry?.follow_up_done ?? false,
  };
}

type FieldsProps = {
  entry?: TimelineEntry;
  save: (values: ActivityValues) => Promise<unknown>;
  pending: boolean;
  onClose: () => void;
};

function ActivityFields({ entry, save, pending, onClose }: FieldsProps) {
  const [start] = useState(() => initialValues(entry));
  const notify = useNotify();
  const {
    register,
    handleSubmit,
    control,
    setError,
    getValues,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: start });
  const followUpDate = useWatch({ control, name: "follow_up_date" });

  /**
   * The box only holds minutes, so reading an untouched one back would drop the
   * seconds. An activity logged just now would then sort below something that
   * happened moments earlier, and any edit would quietly move it.
   */
  function when(shown: string) {
    if (shown !== start.occurred_at) return new Date(shown).toISOString();
    return entry ? entry.at : new Date().toISOString();
  }

  async function submit(values: Values) {
    try {
      await save({
        type: values.type,
        description: values.description,
        occurred_at: when(values.occurred_at),
        follow_up_date: values.follow_up_date || null,
        follow_up_done: values.follow_up_date ? values.follow_up_done : false,
      });
      notify.success("Activity saved.");
      onClose();
    } catch (error) {
      showSaveError(error, { setError, getValues, notify });
    }
  }

  return (
    <FormDialog
      title={entry ? "Edit activity" : "Log activity"}
      submitLabel="Save activity"
      pending={pending}
      onClose={onClose}
      onSubmit={handleSubmit(submit)}
    >
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Type" htmlFor="activity-type" error={errors.type?.message}>
          <select id="activity-type" className="input" {...register("type")}>
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {capitalize(type)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="When" htmlFor="activity-when" error={errors.occurred_at?.message}>
          <input
            id="activity-when"
            type="datetime-local"
            className="input num"
            aria-invalid={!!errors.occurred_at}
            {...register("occurred_at")}
          />
        </Field>
      </div>
      <Field label="Description" htmlFor="activity-description" error={errors.description?.message}>
        <textarea
          id="activity-description"
          rows={3}
          className="input"
          aria-invalid={!!errors.description}
          {...register("description")}
        />
      </Field>
      <div className="grid grid-cols-2 items-end gap-3.5">
        <Field label="Follow-up date" htmlFor="activity-follow-up" error={errors.follow_up_date?.message}>
          <input id="activity-follow-up" type="date" className="input num" {...register("follow_up_date")} />
        </Field>
        {followUpDate && (
          <label className="flex h-[38px] items-center gap-2 font-medium">
            <input type="checkbox" className="tick" {...register("follow_up_done")} />
            Done
          </label>
        )}
      </div>
    </FormDialog>
  );
}

export function LogActivity({
  link,
  onClose,
}: {
  link: { contact_id: number } | { deal_id: number };
  onClose: () => void;
}) {
  const add = useAddActivity(link);
  return <ActivityFields save={add.mutateAsync} pending={add.isPending} onClose={onClose} />;
}

export function EditActivity({ entry, onClose }: { entry: TimelineEntry; onClose: () => void }) {
  const edit = useEditActivity(entry.id);
  return <ActivityFields entry={entry} save={edit.mutateAsync} pending={edit.isPending} onClose={onClose} />;
}
