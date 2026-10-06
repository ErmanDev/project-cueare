import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/formatters.dart';
import '../../../models/section_model.dart';
import '../../../widgets/async_value_widget.dart';
import '../../../widgets/page_scaffold.dart';
import '../../../widgets/section_header.dart';
import '../../../widgets/status_chip.dart';
import '../admin_providers.dart';

class SectionsScreen extends ConsumerStatefulWidget {
  const SectionsScreen({super.key});

  @override
  ConsumerState<SectionsScreen> createState() => _SectionsScreenState();
}

class _SectionsScreenState extends ConsumerState<SectionsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _search.text = ref.read(sectionSearchProvider);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _applySearch(String raw) {
    ref.read(sectionSearchProvider.notifier).set(raw.trim());
  }

  void _onSearch(String v) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _applySearch(v));
  }

  void _clearSearch() {
    _debounce?.cancel();
    _search.clear();
    setState(() {});
    _applySearch('');
  }

  @override
  Widget build(BuildContext context) {
    final sections = ref.watch(sectionsProvider);
    final scheme = Theme.of(context).colorScheme;
    final searching = _search.text.trim().isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Sections'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _search,
              onChanged: _onSearch,
              onSubmitted: (v) {
                _debounce?.cancel();
                _applySearch(v);
              },
              textInputAction: TextInputAction.search,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: scheme.onSurface,
              ),
              cursorColor: scheme.primary,
              decoration: InputDecoration(
                hintText: 'Search section, code, or program',
                hintStyle: TextStyle(color: scheme.onSurfaceVariant),
                prefixIcon: Icon(Icons.search, color: scheme.onSurfaceVariant),
                suffixIcon: searching
                    ? IconButton(
                        tooltip: 'Clear search',
                        icon: Icon(Icons.clear, color: scheme.onSurfaceVariant),
                        onPressed: _clearSearch,
                      )
                    : null,
                filled: true,
                fillColor: scheme.surfaceContainerLowest,
              ),
            ),
          ),
        ),
      ),
      body: AppContentWidth(
        child: RefreshIndicator(
          onRefresh: () => ref.refresh(sectionsProvider.future),
          child: AsyncValueWidget(
            value: sections,
            onRetry: () => ref.invalidate(sectionsProvider),
            loadingMessage: 'Loading sections…',
            data: (list) {
              if (list.isEmpty) {
                return _ScrollableFill(
                  child: EmptyState(
                    icon: Icons.class_outlined,
                    title: searching ? 'No matching sections' : 'No sections yet',
                    subtitle: searching
                        ? 'Try a different name, code, or program.'
                        : 'Sections come from the school roster. Pull down to refresh.',
                    action: searching
                        ? OutlinedButton(
                            onPressed: _clearSearch,
                            child: const Text('Clear search'),
                          )
                        : null,
                  ),
                );
              }
              final items = _groupedItems(list);
              return ListView.builder(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: AppListPadding.standard,
                itemCount: items.length,
                itemBuilder: (context, i) => items[i].build(context),
              );
            },
          ),
        ),
      ),
    );
  }

  List<_Row> _groupedItems(List<SectionModel> list) {
    final groups = <String, List<SectionModel>>{};
    for (final s in list) {
      groups.putIfAbsent(s.programCode, () => []).add(s);
    }
    final codes = groups.keys.toList()..sort();
    final items = <_Row>[
      _CountRow(
        '${list.length} section${list.length == 1 ? '' : 's'}',
      ),
    ];
    for (final code in codes) {
      final rows = [...groups[code]!]
        ..sort((a, b) {
          final byYear = a.yearLevel.compareTo(b.yearLevel);
          return byYear != 0 ? byYear : a.title.compareTo(b.title);
        });
      items.add(
        _HeaderRow(
          title: rows.first.programName,
          subtitle: code,
        ),
      );
      for (final s in rows) {
        items.add(_SectionRow(section: s));
      }
    }
    return items;
  }
}

class SectionDetailScreen extends ConsumerWidget {
  const SectionDetailScreen({super.key, required this.section});
  final SectionModel section;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(sectionDetailProvider(section.sectionId));
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(title: Text(section.title)),
      body: AppContentWidth(
        child: RefreshIndicator(
          onRefresh: () =>
              ref.refresh(sectionDetailProvider(section.sectionId).future),
          child: AsyncValueWidget(
            value: detail,
            onRetry: () =>
                ref.invalidate(sectionDetailProvider(section.sectionId)),
            loadingMessage: 'Loading roster…',
            data: (page) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: AppListPadding.compact,
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            page.section.programName,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            page.section.title,
                            style: Theme.of(context).textTheme.headlineSmall,
                          ),
                          if (page.section.sectionName != null &&
                              page.section.sectionName !=
                                  page.section.sectionCode) ...[
                            const SizedBox(height: 2),
                            Text(
                              page.section.sectionCode,
                              style: Theme.of(context).textTheme.bodySmall
                                  ?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                    fontFamily: 'monospace',
                                    letterSpacing: 0.4,
                                  ),
                            ),
                          ],
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              StatusChip(
                                label: Fmt.yearLevel(page.section.yearLevel),
                                tone: StatusChipTone.primary,
                              ),
                              if (page.section.termName.isNotEmpty)
                                StatusChip(label: page.section.termName),
                              if (page.section.yearCode != null)
                                StatusChip(label: page.section.yearCode!),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Text(
                            '${page.students.length} enrolled',
                            style: Theme.of(context).textTheme.labelLarge
                                ?.copyWith(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                  if (page.students.isEmpty)
                    const EmptyState(
                      icon: Icons.school_outlined,
                      title: 'No students enrolled',
                      subtitle:
                          'This section has no active enrollments right now.',
                    )
                  else
                    for (final s in page.students)
                      Card(
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: scheme.primaryContainer,
                            foregroundColor: scheme.onPrimaryContainer,
                            child: Text(
                              s.displayName.isNotEmpty
                                  ? s.displayName[0].toUpperCase()
                                  : '?',
                            ),
                          ),
                          title: Text(
                            s.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            s.studentNumber,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              letterSpacing: 0.3,
                            ),
                          ),
                          trailing: s.enrollmentLabel == null
                              ? null
                              : StatusChip(
                                  label: s.enrollmentLabel!,
                                  tone: s.isEnrolled
                                      ? StatusChipTone.success
                                      : StatusChipTone.neutral,
                                ),
                        ),
                      ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ScrollableFill extends StatelessWidget {
  const _ScrollableFill({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        return ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: constraints.maxHeight,
              child: child,
            ),
          ],
        );
      },
    );
  }
}

sealed class _Row {
  const _Row();
  Widget build(BuildContext context);
}

class _CountRow extends _Row {
  const _CountRow(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 4, 4, 4),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _HeaderRow extends _Row {
  const _HeaderRow({required this.title, required this.subtitle});
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return SectionHeader(
      title: title,
      subtitle: subtitle,
      padding: const EdgeInsets.fromLTRB(4, 16, 4, 4),
    );
  }
}

class _SectionRow extends _Row {
  const _SectionRow({required this.section});
  final SectionModel section;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final meta = [
      Fmt.yearLevel(section.yearLevel),
      if (section.termName.isNotEmpty) section.termName,
    ].join(' · ');

    return Semantics(
      button: true,
      label:
          '${section.title}, ${section.enrolledStudentCount} students. Open section roster.',
      child: Card(
      child: ListTile(
        leading: _ProgramMark(code: section.programCode),
        title: Text(
          section.title,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          meta,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '${section.enrolledStudentCount}',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  color: scheme.primary,
                ),
              ),
              Text(
                section.enrolledStudentCount == 1 ? 'student' : 'students',
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => SectionDetailScreen(section: section),
          ),
        ),
      ),
    ),
    );
  }
}

class _ProgramMark extends StatelessWidget {
  const _ProgramMark({required this.code});
  final String code;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final label = code.length <= 5 ? code : code.substring(0, 5);
    return Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.primaryContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        textAlign: TextAlign.center,
        maxLines: 1,
        overflow: TextOverflow.fade,
        softWrap: false,
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
          color: scheme.onPrimaryContainer,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
