---
layout: default
permalink: /students/
---

## Students and Postdoctoral Scholars

None of my work would be possible without amazing collaborators including the past and present students I've had the pleasure to work with. We work together within the  <a href="https://raptlab.github.io" target="_blank">Representations, Activity, Play and Technology (RAPT) Lab</a> where you can see more about our work, and our team.

{% assign groups = site.data.members | group_by: "status" | sort: "value" %}
{% for group in groups %}
<h3>{{ group.name }}{% if group.name != "Lab Alumni"%}s{%endif%}</h3><ul>
{% assign itemsSorted = group.items | sort: "last" %}
{% for item in itemsSorted %}
    {% if item.last != 'Danish'%}
        <li>{% if item.url %}<a href="{{ item.url }}" target="_blank">{% endif %}{{ item.first }} {{ item.last }}{% if item.url %}</a>{% endif %}<em>, {{ item.role }}</em>
        </li>
    {% endif %}
{% endfor %}
</ul>
{% endfor %}