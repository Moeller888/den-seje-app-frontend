alter table questions
add constraint questions_answer_format_check
check (
  (
    answer_format = 'mc'
    and content ? 'options'
    and jsonb_typeof(content->'options') = 'array'
    and jsonb_array_length(content->'options') >= 2
  )
  or
  (
    answer_format = 'number'
    and content ? 'correct'
  )
  or
  (
    answer_format = 'text'
    and not (content ? 'options')
  )
);
